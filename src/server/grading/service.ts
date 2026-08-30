import type { Case, Grade, GradeReversal, GradeValue, Verification, VerificationMethod } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { executeSystemTransition, executeTransition, IllegalTransitionError } from "@/server/state-machine/executor";
import type { TransitionActor } from "@/server/state-machine/types";
import { deliverablesPresent } from "./checklist";

export class DocumentNotReadyForVerificationError extends Error {
  constructor(public readonly state: string) {
    super(`Document's case is not PENDING_VERIFICATION (currently ${state}).`);
    this.name = "DocumentNotReadyForVerificationError";
  }
}

export class NoLiveRecommendationError extends Error {
  constructor() {
    super("No grade recommendation is on record for this case.");
    this.name = "NoLiveRecommendationError";
  }
}

export type Actor = { userId: string; roles: readonly import("@prisma/client").RoleName[] };

function toTransitionActor(actor: Actor): TransitionActor {
  return { type: "user", userId: actor.userId, roles: actor.roles };
}

/** BR-11: records a verification for one document. Only the two
 * Document-backed deliverables ever call this — see docs/modules/M09.md
 * "Scope decisions." */
export async function verifyDocument(input: {
  documentId: string;
  method: VerificationMethod;
  note?: string;
  verifiedBy: string;
}): Promise<Verification> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: input.documentId },
    select: { caseId: true, case: { select: { state: true } } },
  });
  if (document.case.state !== "PENDING_VERIFICATION") {
    throw new DocumentNotReadyForVerificationError(document.case.state);
  }

  return prisma.verification.create({
    data: {
      documentId: input.documentId,
      method: input.method,
      note: input.note,
      verifierUserId: input.verifiedBy,
    },
  });
}

async function getDeliverableFacts(caseId: string) {
  const [offerLetter, completionCertificate, usedTokenWithEvaluation] = await Promise.all([
    prisma.document.findFirst({
      where: { caseId, type: "OFFER_LETTER", status: "ACTIVE" },
      include: { verifications: { take: 1 } },
    }),
    prisma.document.findFirst({
      where: { caseId, type: "COMPLETION_CERTIFICATE", status: "ACTIVE" },
      include: { verifications: { take: 1 } },
    }),
    prisma.supervisorToken.findFirst({
      where: { caseId, evaluation: { isNot: null } },
    }),
  ]);

  return {
    hasActiveOfferLetter: offerLetter !== null,
    hasActiveCompletionCertificate: completionCertificate !== null,
    hasSubmittedEvaluation: usedTokenWithEvaluation !== null,
    offerLetterVerified: (offerLetter?.verifications.length ?? 0) > 0,
    completionCertificateVerified: (completionCertificate?.verifications.length ?? 0) > 0,
  };
}

/** BR-10: fires row 9 (`DOCS_PENDING -> PENDING_VERIFICATION`, SYSTEM)
 * automatically once all three deliverables exist. Called from M06's
 * completion-certificate route and M08's evaluation-submit route —
 * whichever of the two arrives last is the one that actually triggers
 * it. Silently no-ops if the case isn't ready yet or has already moved
 * on (a concurrent path got there first) — anything else propagates. */
export async function advanceToVerificationIfReady(caseId: string): Promise<void> {
  const facts = await getDeliverableFacts(caseId);
  if (!deliverablesPresent(facts)) {
    return;
  }
  try {
    await executeSystemTransition(caseId, "PENDING_VERIFICATION", "deliverables-complete", {
      context: { deliverables: facts },
    });
  } catch (err) {
    if (err instanceof IllegalTransitionError) {
      return; // case wasn't in DOCS_PENDING (already advanced, or never got here) -- not an error.
    }
    throw err;
  }
}

/** BR-11: fires row 10 (`PENDING_VERIFICATION -> VERIFIED`, FOCAL) — a
 * distinct, explicit action, not auto-chained; see docs/modules/M09.md. */
export async function markVerified(input: { caseId: string; actor: Actor }): Promise<Case> {
  const facts = await getDeliverableFacts(input.caseId);
  await executeTransition(input.caseId, "VERIFIED", toTransitionActor(input.actor), {
    context: { deliverables: facts },
  });
  return prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
}

/** BR-12 (recommend half): fires row 11. Where the recommended value
 * lives until award time — see docs/modules/M09.md "Scope decisions." */
export async function recommendGrade(input: {
  caseId: string;
  actor: Actor;
  value: GradeValue;
  reason: string;
}): Promise<Case> {
  await prisma.case.update({
    where: { id: input.caseId },
    data: { recommendedGradeValue: input.value, recommendedBy: input.actor.userId },
  });

  await executeTransition(input.caseId, "GRADE_RECOMMENDED", toTransitionActor(input.actor), {
    reason: input.reason,
  });

  return prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
}

/** BR-12 (award half)/BR-13/BR-14: creates the immutable `Grade` row and
 * fires row 12 (`CLOSED_PASS`) or row 13 (`CLOSED_INCOMPLETE`) depending
 * on the HoD's own chosen `value` — not necessarily what was
 * recommended, see docs/modules/M09.md "Scope decisions". */
export async function awardGrade(input: {
  caseId: string;
  actor: Actor;
  value: GradeValue;
  reason?: string;
}): Promise<{ case: Case; grade: Grade }> {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: input.caseId },
    select: { recommendedBy: true },
  });
  if (!kase.recommendedBy) {
    throw new NoLiveRecommendationError();
  }

  const targetState = input.value === "P" ? "CLOSED_PASS" : "CLOSED_INCOMPLETE";

  // The transition (actor role, reason, recommenderNotAwarder guard)
  // runs *before* the Grade row is created, deliberately — creating it
  // first and having the transition fail afterward would leave an
  // orphaned Grade row behind with grades.case_id unique, permanently
  // blocking any retry once whatever failed is fixed.
  await executeTransition(input.caseId, targetState, toTransitionActor(input.actor), {
    reason: input.reason,
    context: { grade: { recommendedBy: kase.recommendedBy, awardedBy: input.actor.userId } },
  });

  const grade = await prisma.grade.create({
    data: {
      caseId: input.caseId,
      value: input.value,
      recommendedBy: kase.recommendedBy,
      awardedBy: input.actor.userId,
    },
  });

  const updatedCase = await prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
  return { case: updatedCase, grade };
}

/** BR-14: additive only. The `Grade` row is never updated — enforced
 * both here (no `update` call exists) and at the database privilege
 * level (`REVOKE UPDATE, DELETE ON grades`, M01). Doesn't touch
 * `cases.state` — see docs/modules/M09.md "Scope decisions" (BR-15). */
export async function reverseGrade(input: {
  gradeId: string;
  deanUserId: string;
  reason: string;
}): Promise<GradeReversal> {
  return prisma.gradeReversal.create({
    data: { gradeId: input.gradeId, deanUserId: input.deanUserId, reason: input.reason },
  });
}

export async function listVerificationsForCase(caseId: string): Promise<Verification[]> {
  return prisma.verification.findMany({
    where: { document: { caseId } },
    orderBy: { createdAt: "asc" },
  });
}
