import type { Case, CaseState, RoleName, Waiver } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { executeTransition } from "@/server/state-machine/executor";
import type { TransitionActor } from "@/server/state-machine/types";
import { storeDocument } from "@/server/documents/store";
import { notifyWaiverInitiated } from "@/server/notifications/service";

export type Actor = { userId: string; roles: readonly RoleName[] };

function toTransitionActor(actor: Actor): TransitionActor {
  return { type: "user", userId: actor.userId, roles: actor.roles };
}

const TERMINAL_CASE_STATES: readonly CaseState[] = [
  "CLOSED_PASS",
  "CLOSED_INCOMPLETE",
  "WITHDRAWN",
  "WAIVER_GRANTED",
  "WAIVER_DENIED",
  "RESTART_DENIED",
  "RESTART_AUTHORIZED",
];

const WAIVER_IN_PROGRESS_STATES: readonly CaseState[] = [
  "WAIVER_REQUESTED",
  "WAIVER_COUNTERSIGNED",
];

export class AlreadyHasWaiverError extends Error {
  constructor() {
    super("This student already has a waiver on record (BR-23: at most one, ever).");
    this.name = "AlreadyHasWaiverError";
  }
}

export class AlreadyHasActiveCaseError extends Error {
  constructor() {
    super("Student already has a non-terminal case; a waiver cannot be initiated alongside it.");
    this.name = "AlreadyHasActiveCaseError";
  }
}

export class WaiverNotInProgressError extends Error {
  constructor() {
    super("This waiver's case is not in a WAIVER_REQUESTED/WAIVER_COUNTERSIGNED state.");
    this.name = "WaiverNotInProgressError";
  }
}

/** `waivers` has no `case_id` column — its genesis-insert `Case` (BR-21)
 * is looked up the other way, via `studentId` plus "the one case
 * currently sitting in a WAIVER_* in-progress state." Safe: BR-23 caps a
 * student at one waiver ever, and `cases_one_nonterminal_per_student`
 * (M01) caps them at one non-terminal case at a time, so at most one
 * case can ever match this query for a given student. */
async function caseForWaiver(waiver: Waiver): Promise<Case> {
  const kase = await prisma.case.findFirst({
    where: { studentId: waiver.studentId, state: { in: [...WAIVER_IN_PROGRESS_STATES] } },
  });
  if (!kase) {
    throw new WaiverNotInProgressError();
  }
  return kase;
}

/** BR-21/22: genesis-inserts a new `Case` directly in `WAIVER_REQUESTED`
 * (same pattern as BR-02's sweep and M10's restart — see
 * docs/modules/M11.md "Resolving OQ-12"), then stores the mandatory
 * supporting-evidence document against it, then creates the `Waiver`
 * row itself.
 *
 * Ordering matters: the `Case` row is created *before* the document is
 * stored (`Document.caseId` is required, so nothing else is possible),
 * but if `storeDocument()` then fails — a bad file type, an infected
 * upload, an oversized file, all routine failure modes — the
 * just-created `Case` is deleted before the error propagates. Without
 * that, `waivers.student_id`'s unique constraint would permanently block
 * every future attempt for this student, since the `Case` row would
 * outlive the failed upload with nothing to retry against. Deleting a
 * genesis `Case` row is otherwise unprecedented in this codebase —
 * safe here specifically because this row never passed through the
 * transition executor and nothing else can reference it yet (the
 * `Waiver` row itself is only created *after* the document succeeds). */
export async function initiateWaiver(input: {
  studentId: string;
  actor: Actor;
  circumstance: string;
  reason: string;
  evidenceFile: File;
}): Promise<{ case: Case; waiver: Waiver }> {
  const existingWaiver = await prisma.waiver.findUnique({
    where: { studentId: input.studentId },
    select: { id: true },
  });
  if (existingWaiver) {
    throw new AlreadyHasWaiverError();
  }

  const existingCases = await prisma.case.findMany({
    where: { studentId: input.studentId },
    select: { state: true },
  });
  if (existingCases.some((c) => !TERMINAL_CASE_STATES.includes(c.state))) {
    throw new AlreadyHasActiveCaseError();
  }

  const kase = await prisma.case.create({
    data: { studentId: input.studentId, state: "WAIVER_REQUESTED" },
  });

  try {
    await storeDocument({
      caseId: kase.id,
      type: "SUPPORTING_EVIDENCE",
      file: input.evidenceFile,
      uploadedBy: input.actor.userId,
    });
  } catch (err) {
    await prisma.case.delete({ where: { id: kase.id } });
    throw err;
  }

  const waiver = await prisma.$transaction(async (tx) => {
    const created = await tx.waiver.create({
      data: {
        studentId: input.studentId,
        circumstance: input.circumstance,
        focalSignerId: input.actor.userId,
        focalReason: input.reason,
        focalSignedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        eventType: "WAIVER_INITIATED",
        entityType: "case",
        entityId: kase.id,
        metadata: { studentId: input.studentId, waiverId: created.id },
      },
    });
    return created;
  });

  // M12: a genesis insert, so it never goes through executeTransition()'s
  // generic notification hook — the HoD needs to know from the moment a
  // waiver is requested, not just once the Dean's turn comes.
  await notifyWaiverInitiated(kase.id);

  return { case: kase, waiver };
}

async function loadWaiver(waiverId: string): Promise<Waiver> {
  return prisma.waiver.findUniqueOrThrow({ where: { id: waiverId } });
}

/** BR-21 (HoD stage, approve): fires row 22. */
export async function countersignWaiver(input: {
  waiverId: string;
  actor: Actor;
  reason: string;
}): Promise<Waiver> {
  const waiver = await loadWaiver(input.waiverId);
  const kase = await caseForWaiver(waiver);
  await executeTransition(kase.id, "WAIVER_COUNTERSIGNED", toTransitionActor(input.actor), {
    reason: input.reason,
  });
  return prisma.waiver.update({
    where: { id: waiver.id },
    data: { hodSignerId: input.actor.userId, hodReason: input.reason, hodSignedAt: new Date() },
  });
}

/** BR-21 (HoD stage, refuse): fires row 23. Ends the waiver — BR-23
 * makes it structurally impossible to retry for this student. */
export async function denyWaiverAtHod(input: {
  waiverId: string;
  actor: Actor;
  reason: string;
}): Promise<Waiver> {
  const waiver = await loadWaiver(input.waiverId);
  const kase = await caseForWaiver(waiver);
  await executeTransition(kase.id, "WAIVER_DENIED", toTransitionActor(input.actor), {
    reason: input.reason,
  });
  return prisma.waiver.update({
    where: { id: waiver.id },
    data: {
      hodSignerId: input.actor.userId,
      hodReason: input.reason,
      hodSignedAt: new Date(),
      outcome: "DENIED",
    },
  });
}

/** BR-21 (Dean stage, approve, final): fires row 24. */
export async function approveWaiver(input: {
  waiverId: string;
  actor: Actor;
  reason: string;
}): Promise<Waiver> {
  const waiver = await loadWaiver(input.waiverId);
  const kase = await caseForWaiver(waiver);
  await executeTransition(kase.id, "WAIVER_GRANTED", toTransitionActor(input.actor), {
    reason: input.reason,
  });
  return prisma.waiver.update({
    where: { id: waiver.id },
    data: {
      deanSignerId: input.actor.userId,
      deanReason: input.reason,
      deanSignedAt: new Date(),
      outcome: "GRANTED",
    },
  });
}

/** BR-21 (Dean stage, refuse, final): fires row 25. */
export async function denyWaiverAtDean(input: {
  waiverId: string;
  actor: Actor;
  reason: string;
}): Promise<Waiver> {
  const waiver = await loadWaiver(input.waiverId);
  const kase = await caseForWaiver(waiver);
  await executeTransition(kase.id, "WAIVER_DENIED", toTransitionActor(input.actor), {
    reason: input.reason,
  });
  return prisma.waiver.update({
    where: { id: waiver.id },
    data: {
      deanSignerId: input.actor.userId,
      deanReason: input.reason,
      deanSignedAt: new Date(),
      outcome: "DENIED",
    },
  });
}

/** BR-24: staff-only visibility list. Full dashboard/annual-report
 * aggregation is M13's job — see docs/modules/M11.md "Scope decisions." */
export async function listWaivers(): Promise<Waiver[]> {
  return prisma.waiver.findMany({ orderBy: { createdAt: "asc" } });
}
