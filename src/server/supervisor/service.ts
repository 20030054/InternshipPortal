import type { Evaluation, SupervisorToken } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { generateRawSupervisorToken, hashSupervisorToken } from "./token-protocol";

/**
 * MASTER_PROMPT.md §2.5/§9: the token issue/verify/submit core. See
 * docs/modules/M08.md "Scope decisions" for the design choices below.
 */

export class InvalidCaseStateError extends Error {
  constructor(public readonly state: string) {
    super(`Cannot issue a supervisor token while the case is ${state}.`);
    this.name = "InvalidCaseStateError";
  }
}

function tokenTtlMs(): number {
  const days = Number(process.env.SUPERVISOR_TOKEN_TTL_DAYS ?? 21);
  return days * 24 * 60 * 60 * 1000;
}

/** BR-28's window — read at the call site, same convention as every
 * other env-configured value in this codebase (rate-limit.ts, mail/
 * transport.ts, guards.ts's durationWithinBounds). */
export function supervisorSlaDays(): number {
  return Number(process.env.SUPERVISOR_SLA_DAYS ?? 14);
}

/**
 * Issues a fresh token, revoking any still-live one first — the
 * `supervisor_tokens_one_live_per_case` partial index (M01) would
 * reject a second live row otherwise, but the service does this
 * explicitly so "issue" and "replace" are provably the same code path,
 * not two that happen to converge. Returns the *raw* token; only its
 * hash is ever persisted (see token-protocol.ts).
 */
export async function issueSupervisorToken(input: {
  caseId: string;
  supervisorEmail: string;
  issuedBy: string;
}): Promise<{ token: SupervisorToken; rawToken: string }> {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: input.caseId },
    select: { state: true },
  });
  if (kase.state !== "DOCS_PENDING") {
    throw new InvalidCaseStateError(kase.state);
  }

  const rawToken = generateRawSupervisorToken();
  const tokenHash = hashSupervisorToken(rawToken);
  const expiresAt = new Date(Date.now() + tokenTtlMs());

  const token = await prisma.$transaction(async (tx) => {
    await tx.supervisorToken.updateMany({
      where: { caseId: input.caseId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await tx.supervisorToken.create({
      data: {
        caseId: input.caseId,
        tokenHash,
        expiresAt,
        supervisorEmail: input.supervisorEmail,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: input.issuedBy,
        eventType: "SUPERVISOR_TOKEN_ISSUED",
        entityType: "case",
        entityId: input.caseId,
        metadata: { supervisorTokenId: created.id, supervisorEmail: input.supervisorEmail },
      },
    });
    return created;
  });

  return { token, rawToken };
}

export type PublicCaseView = {
  studentDisplayName: string;
  companyName: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
};

export type TokenLookupResult =
  | { status: "invalid" }
  | { status: "already_submitted" }
  | { status: "live"; caseId: string; view: PublicCaseView };

/** §2.5: "view the student name, company name and internship dates
 * only." `invalid` deliberately covers not-found, expired, and revoked
 * alike — distinguishing them in the public response would leak
 * information an anonymous caller has no business learning. */
export async function lookupSupervisorToken(rawToken: string): Promise<TokenLookupResult> {
  const tokenHash = hashSupervisorToken(rawToken);
  const record = await prisma.supervisorToken.findUnique({
    where: { tokenHash },
    include: {
      case: {
        select: {
          plannedStart: true,
          plannedEnd: true,
          company: { select: { name: true } },
          student: { select: { registrationNumber: true, user: { select: { fullName: true } } } },
        },
      },
    },
  });

  if (!record) {
    return { status: "invalid" };
  }
  if (record.usedAt !== null) {
    return { status: "already_submitted" };
  }
  if (record.revokedAt !== null || record.expiresAt.getTime() < Date.now()) {
    return { status: "invalid" };
  }

  return {
    status: "live",
    caseId: record.caseId,
    view: {
      studentDisplayName:
        record.case.student.user.fullName ?? record.case.student.registrationNumber,
      companyName: record.case.company?.name ?? "",
      plannedStart: record.case.plannedStart,
      plannedEnd: record.case.plannedEnd,
    },
  };
}

export type SubmitEvaluationResult =
  | { status: "invalid" }
  | { status: "already_submitted" }
  | { status: "submitted"; evaluation: Evaluation };

/** Locks the token (`usedAt`) and creates the `Evaluation` row in one
 * transaction — `evaluations.supervisor_token_id` is itself unique
 * (M01), a second line of defence against a replay racing this same
 * check. */
export async function submitEvaluation(input: {
  rawToken: string;
  performanceRating: number;
  comments: string;
}): Promise<SubmitEvaluationResult> {
  const tokenHash = hashSupervisorToken(input.rawToken);
  const record = await prisma.supervisorToken.findUnique({ where: { tokenHash } });

  if (!record) {
    return { status: "invalid" };
  }
  if (record.usedAt !== null) {
    return { status: "already_submitted" };
  }
  if (record.revokedAt !== null || record.expiresAt.getTime() < Date.now()) {
    return { status: "invalid" };
  }

  const evaluation = await prisma.$transaction(async (tx) => {
    await tx.supervisorToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return tx.evaluation.create({
      data: {
        supervisorTokenId: record.id,
        content: { performanceRating: input.performanceRating, comments: input.comments },
      },
    });
  });

  return { status: "submitted", evaluation };
}

/** For `GET /api/cases/:id/evaluation` — the caller (route) is
 * responsible for the Focal/HoD-vs-Student-with-flag visibility check;
 * this just fetches whatever evaluation exists for the case's live or
 * most recent token. */
export async function getEvaluationForCase(caseId: string): Promise<Evaluation | null> {
  const token = await prisma.supervisorToken.findFirst({
    where: { caseId, evaluation: { isNot: null } },
    orderBy: { createdAt: "desc" },
    include: { evaluation: true },
  });
  return token?.evaluation ?? null;
}

/** M12's future reminder job calls this after actually sending a
 * reminder email — this module only tracks the counter. */
export async function recordReminderSent(tokenId: string): Promise<void> {
  await prisma.supervisorToken.update({
    where: { id: tokenId },
    data: { reminderCount: { increment: 1 }, lastReminderSentAt: new Date() },
  });
}
