import type { CaseState } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { Transition, TransitionActor, TransitionContext } from "./types";
import { TRANSITIONS } from "./transitions";

/**
 * The only code path in this system permitted to write `cases.state`.
 * MASTER_PROMPT.md §5.2: "The transition executor is the only code path
 * in the system permitted to write cases.state. Enforce with a database
 * trigger that rejects direct updates to state from anything other than
 * the transition function." The trigger (M01) rejects any UPDATE OF
 * state that doesn't run inside a transaction with
 * `app.transition_authorized = 'true'` set — this executor is the only
 * place that ever sets it.
 */

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: CaseState,
    public readonly to: CaseState,
  ) {
    super(`No transition defined from ${from} to ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export class WrongActorRoleError extends Error {
  constructor(public readonly required: string) {
    super(`This transition requires the ${required} role/actor.`);
    this.name = "WrongActorRoleError";
  }
}

export class MissingReasonError extends Error {
  constructor() {
    super("This transition requires a reason.");
    this.name = "MissingReasonError";
  }
}

export class TransitionGuardError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Transition denied: ${reasons.join("; ")}`);
    this.name = "TransitionGuardError";
  }
}

export class CaseNotFoundError extends Error {
  constructor(caseId: string) {
    super(`No case with id ${caseId}`);
    this.name = "CaseNotFoundError";
  }
}

function actorMatches(actor: TransitionActor, required: Transition["actorRole"]): boolean {
  if (required === "SYSTEM") {
    return actor.type === "system";
  }
  return actor.type === "user" && actor.roles.includes(required);
}

function actorUserId(actor: TransitionActor): string | null {
  return actor.type === "user" ? actor.userId : null;
}

function actorSystemJob(actor: TransitionActor): string | null {
  return actor.type === "system" ? actor.job : null;
}

async function auditDenial(
  caseId: string,
  actor: TransitionActor,
  from: CaseState,
  to: CaseState,
  reason: string,
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorUserId: actorUserId(actor),
      systemJob: actorSystemJob(actor),
      eventType: "TRANSITION_DENIED",
      entityType: "case",
      entityId: caseId,
      metadata: { from, to, reason },
    },
  });
}

/**
 * Runs one transition. `table` defaults to the real TRANSITIONS table
 * and is only ever overridden by this module's own unit tests, which use
 * small synthetic tables to exercise the executor's mechanics in
 * isolation from the real business rules.
 */
export async function executeTransition(
  caseId: string,
  to: CaseState,
  actor: TransitionActor,
  opts: {
    reason?: string;
    context?: Omit<TransitionContext, "caseId" | "actor" | "reason">;
    table?: readonly Transition[];
  } = {},
): Promise<{ id: string; state: CaseState }> {
  const table = opts.table ?? TRANSITIONS;

  const current = await prisma.case.findUnique({ where: { id: caseId } });
  if (!current) {
    throw new CaseNotFoundError(caseId);
  }
  const from = current.state;

  const transition = table.find((t) => t.from === from && t.to === to);
  if (!transition) {
    await auditDenial(caseId, actor, from, to, "illegal transition");
    throw new IllegalTransitionError(from, to);
  }

  if (!actorMatches(actor, transition.actorRole)) {
    await auditDenial(caseId, actor, from, to, "wrong actor role");
    throw new WrongActorRoleError(transition.actorRole);
  }

  if (transition.requiresReason && !opts.reason?.trim()) {
    await auditDenial(caseId, actor, from, to, "missing reason");
    throw new MissingReasonError();
  }

  const ctx: TransitionContext = {
    caseId,
    actor,
    reason: opts.reason,
    ...opts.context,
  };

  const failures: string[] = [];
  for (const guard of transition.guards) {
    const result = guard(ctx);
    if (!result.ok) failures.push(result.reason);
  }
  if (failures.length > 0) {
    await auditDenial(caseId, actor, from, to, failures.join("; "));
    throw new TransitionGuardError(failures);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // The one statement in the entire codebase permitted to set this
    // flag. SET LOCAL scopes it to this transaction only — it cannot
    // leak into a later, unrelated write on a pooled connection.
    await tx.$executeRaw`SET LOCAL app.transition_authorized = 'true'`;

    const result = await tx.case.update({
      where: { id: caseId },
      data: { state: to },
    });

    await tx.caseEvent.create({
      data: {
        caseId,
        actorUserId: actorUserId(actor),
        systemJob: actorSystemJob(actor),
        fromState: from,
        toState: to,
        reason: opts.reason ?? null,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: actorUserId(actor),
        systemJob: actorSystemJob(actor),
        eventType: transition.emitsEvent,
        entityType: "case",
        entityId: caseId,
        metadata: { from, to } as Prisma.InputJsonValue,
      },
    });

    return result;
  });

  return { id: updated.id, state: updated.state };
}

/** Convenience wrapper for a system-initiated transition — a scheduled
 * job never has a user session to build a `TransitionActor` from. */
export async function executeSystemTransition(
  caseId: string,
  to: CaseState,
  job: string,
  opts: {
    reason?: string;
    context?: Omit<TransitionContext, "caseId" | "actor" | "reason">;
    table?: readonly Transition[];
  } = {},
): Promise<{ id: string; state: CaseState }> {
  return executeTransition(caseId, to, { type: "system", job }, opts);
}
