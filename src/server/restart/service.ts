import type { Case, Escalation, RestartRequest, RoleName } from "@prisma/client";
import { prisma } from "@/server/db/client";
import {
  executeTransition,
  TransitionGuardError,
} from "@/server/state-machine/executor";
import type { TransitionActor } from "@/server/state-machine/types";
import { findOrCreateCompany } from "@/server/companies/service";
import { matchCompany } from "@/server/companies/match";
import {
  computeEligibility,
  semestersRemainingBeforeGraduation,
  GRADUATION_BOUNDARY_SEMESTERS,
  type SemesterFact,
} from "@/server/roster/eligibility";

export type Actor = { userId: string; roles: readonly RoleName[] };

function toTransitionActor(actor: Actor): TransitionActor {
  return { type: "user", userId: actor.userId, roles: actor.roles };
}

function restartCap(): number {
  return Number(process.env.RESTART_CAP ?? 1);
}

function companyMatchThreshold(): number {
  return Number(process.env.COMPANY_MATCH_THRESHOLD ?? 0.85);
}

export class RestartRequestNotPendingError extends Error {
  constructor(public readonly outcome: string) {
    super(`Restart request is not PENDING (currently ${outcome}).`);
    this.name = "RestartRequestNotPendingError";
  }
}

export class RestartRequestNotDeniedError extends Error {
  constructor(public readonly outcome: string) {
    super(`Restart request is not DENIED (currently ${outcome}).`);
    this.name = "RestartRequestNotDeniedError";
  }
}

export class AlreadyEscalatedError extends Error {
  constructor() {
    super("This case's restart denial has already been ruled on by a Dean (BR-18: final).");
    this.name = "AlreadyEscalatedError";
  }
}

export class MissingOverrideAcknowledgementError extends Error {
  constructor() {
    super(
      "This request's company match was flagged (BR-17) — resubmit with acknowledgeFlaggedMatch: true.",
    );
    this.name = "MissingOverrideAcknowledgementError";
  }
}

/** BR-19: counts only *granted* restarts, across the student's whole
 * restart chain (every case they've ever had, not just the immediate
 * failed one) — a DENIED attempt was never "granted" and doesn't count
 * against the cap. */
export async function countAuthorizedRestarts(studentId: string): Promise<number> {
  return prisma.restartRequest.count({
    where: { outcome: "AUTHORIZED", failedCase: { studentId } },
  });
}

async function computeRestartFacts(failedCaseId: string) {
  const failedCase = await prisma.case.findUniqueOrThrow({
    where: { id: failedCaseId },
    select: {
      studentId: true,
      state: true,
      company: { select: { normalisedName: true, registrationNumber: true } },
    },
  });

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: failedCase.studentId },
    select: { admissionSemesterId: true },
  });
  const semesters: SemesterFact[] = await prisma.semester.findMany({
    select: { id: true, sequenceNumber: true, status: true },
  });
  const eligibility = computeEligibility(student.admissionSemesterId, semesters);
  const semestersRemaining = semestersRemainingBeforeGraduation(
    eligibility.semestersCompleted,
  );
  const existingRestartCount = await countAuthorizedRestarts(failedCase.studentId);

  return { failedCase, semestersRemaining, existingRestartCount };
}

export type RequestRestartResult =
  | { outcome: "PENDING"; request: RestartRequest; case: Case }
  | { outcome: "DENIED"; request: RestartRequest; reasons: string[]; case: Case };

/** BR-16/17/19: the Focal Person's restart request. Always produces a
 * `RestartRequest` row — `PENDING` if `CLOSED_INCOMPLETE -> RESTART_REQUESTED`
 * succeeds, `DENIED` if any of G1/G2/G4 rejects it — see
 * docs/modules/M10.md "Scope decisions" for why a guard failure here
 * still leaves a real, escalatable record instead of a bare error. */
export async function requestRestart(input: {
  caseId: string;
  actor: Actor;
  newCompanyName: string;
  newCompanyContact: string;
  newCompanyRegistrationNumber?: string;
  reason: string;
}): Promise<RequestRestartResult> {
  const { failedCase, semestersRemaining, existingRestartCount } =
    await computeRestartFacts(input.caseId);

  const newCompany = await findOrCreateCompany({
    name: input.newCompanyName,
    contact: input.newCompanyContact,
    registrationNumber: input.newCompanyRegistrationNumber,
  });

  const threshold = companyMatchThreshold();
  const g1 = matchCompany(
    {
      normalizedName: failedCase.company?.normalisedName ?? "",
      registrationNumber: failedCase.company?.registrationNumber ?? null,
    },
    { normalizedName: newCompany.normalisedName, registrationNumber: newCompany.registrationNumber },
    threshold,
  );
  const cap = restartCap();
  const g2 = {
    semestersRemaining,
    boundary: GRADUATION_BOUNDARY_SEMESTERS,
    pass: semestersRemaining >= 1,
  };

  const restartContext = {
    failedCaseCompanyNormalizedName: failedCase.company?.normalisedName ?? null,
    newCompanyNormalizedName: newCompany.normalisedName,
    failedCaseCompanyRegistrationNumber: failedCase.company?.registrationNumber ?? null,
    newCompanyRegistrationNumber: newCompany.registrationNumber,
    semestersRemaining,
    existingRestartCount,
    restartCap: cap,
  };

  const commonData = {
    failedCaseId: input.caseId,
    newCompanyId: newCompany.id,
    g1Result: g1,
    g2Result: g2,
    focalSignerId: input.actor.userId,
    focalReason: input.reason,
    focalSignedAt: new Date(),
    restartCapAtRequest: cap,
  };

  try {
    await executeTransition(input.caseId, "RESTART_REQUESTED", toTransitionActor(input.actor), {
      reason: input.reason,
      context: { restart: restartContext },
    });
  } catch (err) {
    if (err instanceof TransitionGuardError) {
      const request = await prisma.restartRequest.create({
        data: { ...commonData, outcome: "DENIED" },
      });
      const kase = await prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
      return { outcome: "DENIED", request, reasons: [...err.reasons], case: kase };
    }
    throw err;
  }

  const request = await prisma.restartRequest.create({
    data: { ...commonData, outcome: "PENDING" },
  });
  const kase = await prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
  return { outcome: "PENDING", request, case: kase };
}

/** BR-17 G5/BR-20: the HoD's counter-signature. On success, updates the
 * request to `AUTHORIZED` and creates the new linked `Case` in the same
 * transaction — but only *after* `executeTransition` itself has already
 * succeeded, same ordering lesson as M09's `awardGrade()` (a failed
 * transition must never leave a half-created side effect behind). */
export async function countersignRestart(input: {
  requestId: string;
  actor: Actor;
  reason: string;
  acknowledgeFlaggedMatch?: boolean;
}): Promise<{ request: RestartRequest; newCase: Case }> {
  const request = await prisma.restartRequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });
  if (request.outcome !== "PENDING") {
    throw new RestartRequestNotPendingError(request.outcome);
  }
  const g1 = request.g1Result as { flagged?: boolean };
  if (g1.flagged && input.acknowledgeFlaggedMatch !== true) {
    throw new MissingOverrideAcknowledgementError();
  }

  // Only `distinctSigners` (G5) runs on this edge (M04's transition
  // table: RESTART_REQUESTED -> RESTART_AUTHORIZED's guard list is just
  // `[distinctSigners]`) — it reads only focalSignerId/hodSignerId. The
  // other `restart` fields are unused on this edge; filled with inert
  // placeholders only because `TransitionContext.restart`'s shape is
  // shared across both restart-gate edges (M04's "one flat shape" design).
  await executeTransition(request.failedCaseId, "RESTART_AUTHORIZED", toTransitionActor(input.actor), {
    reason: input.reason,
    context: {
      restart: {
        failedCaseCompanyNormalizedName: null,
        newCompanyNormalizedName: "",
        semestersRemaining: 0,
        existingRestartCount: 0,
        restartCap: 0,
        focalSignerId: request.focalSignerId,
        hodSignerId: input.actor.userId,
      },
    },
  });

  const failedCase = await prisma.case.findUniqueOrThrow({
    where: { id: request.failedCaseId },
    select: { studentId: true },
  });

  const [updatedRequest, newCase] = await prisma.$transaction([
    prisma.restartRequest.update({
      where: { id: request.id },
      data: {
        outcome: "AUTHORIZED",
        hodSignerId: input.actor.userId,
        hodReason: input.reason,
        hodSignedAt: new Date(),
      },
    }),
    prisma.case.create({
      data: {
        studentId: failedCase.studentId,
        state: "ELIGIBLE",
        previousCaseId: request.failedCaseId,
      },
    }),
  ]);

  await prisma.auditEvent.create({
    data: {
      actorUserId: input.actor.userId,
      eventType: "CASE_RESTARTED",
      entityType: "case",
      entityId: newCase.id,
      metadata: {
        previousCaseId: request.failedCaseId,
        restartRequestId: request.id,
        studentId: failedCase.studentId,
      },
    },
  });

  return { request: updatedRequest, newCase };
}

/** BR-18: an explicit HoD denial, distinct from a guard rejecting the
 * initial request outright (see `requestRestart`). No guards on this
 * transition — any HoD reviewing a pending request may deny it for any
 * documented reason. */
export async function denyRestart(input: {
  requestId: string;
  actor: Actor;
  reason: string;
}): Promise<RestartRequest> {
  const request = await prisma.restartRequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });
  if (request.outcome !== "PENDING") {
    throw new RestartRequestNotPendingError(request.outcome);
  }

  await executeTransition(request.failedCaseId, "RESTART_DENIED", toTransitionActor(input.actor), {
    reason: input.reason,
  });

  return prisma.restartRequest.update({
    where: { id: request.id },
    data: {
      outcome: "DENIED",
      hodSignerId: input.actor.userId,
      hodReason: input.reason,
      hodSignedAt: new Date(),
    },
  });
}

/** BR-18: the Dean's final ruling on a denied request. Doesn't touch
 * `cases.state` — `Escalation`'s own doc comment (M01) already claims
 * "no further transition anywhere in the system reads or updates an
 * escalation row once written," and this module doesn't add one. One
 * escalation per case, enforced here (application level — see
 * docs/modules/M10.md "Scope decisions" for why not a DB constraint). */
export async function escalateRestart(input: {
  requestId: string;
  deanUserId: string;
  reason: string;
  ruling: string;
}): Promise<Escalation> {
  const request = await prisma.restartRequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });
  if (request.outcome !== "DENIED") {
    throw new RestartRequestNotDeniedError(request.outcome);
  }

  const existing = await prisma.escalation.findFirst({
    where: { subjectType: "RESTART_DENIED", subjectId: request.failedCaseId },
  });
  if (existing) {
    throw new AlreadyEscalatedError();
  }

  return prisma.escalation.create({
    data: {
      subjectType: "RESTART_DENIED",
      subjectId: request.failedCaseId,
      deanUserId: input.deanUserId,
      reason: input.reason,
      ruling: input.ruling,
    },
  });
}

export async function listRestartRequestsForCase(caseId: string): Promise<RestartRequest[]> {
  return prisma.restartRequest.findMany({
    where: { failedCaseId: caseId },
    orderBy: { createdAt: "asc" },
  });
}
