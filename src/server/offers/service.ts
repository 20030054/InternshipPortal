import type { Case, CaseState, RoleName } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { computeEligibility, type SemesterFact } from "@/server/roster/eligibility";
import {
  executeSystemTransition,
  executeTransition,
} from "@/server/state-machine/executor";
import { TERMINAL_CASE_STATES } from "@/server/state-machine/types";
import { findOrCreateCompany } from "@/server/companies/service";
import { storeDocument } from "@/server/documents/store";

/**
 * Orchestrates the normal path's first arc — MASTER_PROMPT.md's eight
 * steps 1-5 — on top of M04's executor. Nothing here writes
 * `cases.state` directly; every state change goes through
 * `executeTransition()`/`executeSystemTransition()`. See
 * docs/modules/M05.md "Scope decisions" for the reasoning behind every
 * choice below.
 */

export class AlreadyHasActiveCaseError extends Error {
  constructor() {
    super("Student already has a non-terminal case (BR-06).");
    this.name = "AlreadyHasActiveCaseError";
  }
}

export class CannotReopenError extends Error {
  constructor(public readonly state: CaseState) {
    super(`Cannot open a new case while the student's most recent case is ${state}.`);
    this.name = "CannotReopenError";
  }
}

export class NotEligibleError extends Error {
  constructor() {
    super("Student is not yet eligible (BR-01).");
    this.name = "NotEligibleError";
  }
}

/** Every terminal state except WITHDRAWN blocks a fresh `case.open` —
 * see docs/modules/M05.md "Scope decisions." */
const BLOCKED_REOPEN_STATES: readonly CaseState[] = TERMINAL_CASE_STATES.filter(
  (s) => s !== "WITHDRAWN",
);

export type Actor = { userId: string; roles: readonly RoleName[] };

/** BR-01/BR-06: creates the case and, if the student is eligible, wires
 * `ELIGIBILITY_PENDING -> ELIGIBLE` through the real executor —
 * finally answering OQ-11 for the normal path. */
export async function openCase(studentId: string): Promise<Case> {
  const existingCases = await prisma.case.findMany({
    where: { studentId },
    select: { state: true },
  });

  if (existingCases.some((c) => !TERMINAL_CASE_STATES.includes(c.state))) {
    throw new AlreadyHasActiveCaseError();
  }
  const blocking = existingCases.find((c) => BLOCKED_REOPEN_STATES.includes(c.state));
  if (blocking) {
    throw new CannotReopenError(blocking.state);
  }

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { admissionSemesterId: true },
  });
  const semesters: SemesterFact[] = await prisma.semester.findMany({
    select: { id: true, sequenceNumber: true, status: true },
  });
  const eligibility = computeEligibility(student.admissionSemesterId, semesters);
  if (!eligibility.isEligible) {
    throw new NotEligibleError();
  }

  const created = await prisma.case.create({
    data: { studentId, state: "ELIGIBILITY_PENDING" },
  });

  await executeSystemTransition(created.id, "ELIGIBLE", "case-open", {
    context: { eligibility: { isEligible: eligibility.isEligible } },
  });

  return prisma.case.findUniqueOrThrow({ where: { id: created.id } });
}

/**
 * §1.2's third exception path (restart, waiver, withdrawal) — the
 * plainest of the three: no counter-signature, no reason required
 * (M04's own transition table: `guards: []`, `requiresReason: false`
 * on all five rows into `WITHDRAWN`). `executeTransition()` itself
 * already enforces both "only from a pre-approval state" (the
 * executor picks the one matching row for the case's *current* state,
 * or throws `IllegalTransitionError`) and "only the owning student"
 * (`actorRole: STUDENT`, checked against `actor.roles` — case
 * ownership itself is the route's job, same as every other
 * student-owned action, e.g. `completeInternship`'s route). Nothing
 * here decides anything M04 didn't already decide; see D-118.
 */
export async function withdrawCase(input: { caseId: string; actor: Actor }): Promise<Case> {
  const transitionActor = { type: "user" as const, userId: input.actor.userId, roles: input.actor.roles };
  await executeTransition(input.caseId, "WITHDRAWN", transitionActor, {});
  return prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
}

/** BR-07: handles both the first submission (`ELIGIBLE ->
 * OFFER_SUBMITTED`) and resubmission after rejection (`OFFER_REJECTED ->
 * OFFER_SUBMITTED`) — the executor picks the matching table row from the
 * case's current state, so this function doesn't need to know which one
 * it is. Chains straight through to `OFFER_UNDER_REVIEW` (row 3) — see
 * "Scope decisions." */
export async function submitOffer(input: {
  caseId: string;
  actor: Actor;
  companyName: string;
  companyContact: string;
  workDescription: string;
  offerLetterFile: File;
}): Promise<Case> {
  const company = await findOrCreateCompany({
    name: input.companyName,
    contact: input.companyContact,
  });
  const document = await storeDocument({
    caseId: input.caseId,
    type: "OFFER_LETTER",
    file: input.offerLetterFile,
    uploadedBy: input.actor.userId,
  });

  await prisma.case.update({
    where: { id: input.caseId },
    data: { companyId: company.id, workDescription: input.workDescription },
  });

  await executeTransition(
    input.caseId,
    "OFFER_SUBMITTED",
    { type: "user", userId: input.actor.userId, roles: input.actor.roles },
    {
      context: {
        offer: {
          companyName: input.companyName,
          companyContact: input.companyContact,
          workDescription: input.workDescription,
          offerLetterDocumentId: document.id,
        },
      },
    },
  );

  await executeSystemTransition(input.caseId, "OFFER_UNDER_REVIEW", "offer-submission");

  return prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
}

function internshipWeekBounds(): { minWeeks: number; maxWeeks: number } {
  return {
    minWeeks: Number(process.env.MIN_INTERNSHIP_WEEKS ?? 4),
    maxWeeks: Number(process.env.MAX_INTERNSHIP_WEEKS ?? 8),
  };
}

/** BR-08/BR-09: approval captures planned dates and the relevance
 * judgement, then chains straight through to `IN_PROGRESS` (row 7) —
 * see "Scope decisions." */
export async function approveOffer(input: {
  caseId: string;
  actor: Actor;
  reason: string;
  plannedStart: Date;
  plannedEnd: Date;
  relevanceConfirmed: boolean;
}): Promise<Case> {
  const { minWeeks, maxWeeks } = internshipWeekBounds();

  await prisma.case.update({
    where: { id: input.caseId },
    data: {
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd,
      relevanceConfirmed: input.relevanceConfirmed,
    },
  });

  await executeTransition(
    input.caseId,
    "APPROVED",
    { type: "user", userId: input.actor.userId, roles: input.actor.roles },
    {
      reason: input.reason,
      context: {
        offer: {
          plannedStart: input.plannedStart,
          plannedEnd: input.plannedEnd,
          minWeeks,
          maxWeeks,
          relevanceConfirmed: input.relevanceConfirmed,
        },
      },
    },
  );

  await executeSystemTransition(input.caseId, "IN_PROGRESS", "offer-approved");

  return prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
}

export async function rejectOffer(input: {
  caseId: string;
  actor: Actor;
  reason: string;
}): Promise<Case> {
  await executeTransition(
    input.caseId,
    "OFFER_REJECTED",
    { type: "user", userId: input.actor.userId, roles: input.actor.roles },
    { reason: input.reason },
  );

  return prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
}
