import { assignRole } from "./prisma-fixtures";
import { createOfferUnderReviewCase } from "./offer-fixtures";
import { approveOffer } from "@/server/offers/service";
import { completeInternship } from "@/server/progress/service";
import { createUserFixture } from "./prisma-fixtures";
import { validPdfFile } from "./files";
import { storeDocument } from "@/server/documents/store";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import {
  advanceToVerificationIfReady,
  awardGrade,
  markVerified,
  recommendGrade,
  verifyDocument,
} from "@/server/grading/service";
import { prisma } from "@/server/db/client";

/**
 * Walks a case all the way to DOCS_PENDING through the real M05/M07
 * service functions (not a fixture shortcut) — M09's tests need a case
 * that already has a real, ACTIVE OFFER_LETTER `Document` row (BR-10's
 * first leg), which only a real `submitOffer()` call produces.
 */
export async function createDocsPendingCase(startSequence: number) {
  const { caseId, studentUserId } = await createOfferUnderReviewCase(startSequence);

  const focal = await createUserFixture();
  await assignRole(focal.id, "FOCAL");
  await approveOffer({
    caseId,
    actor: { userId: focal.id, roles: ["FOCAL"] },
    reason: "approved, relevant and within duration bounds",
    plannedStart: new Date("2026-06-01"),
    plannedEnd: new Date("2026-07-13"),
    relevanceConfirmed: true,
  });

  await completeInternship({
    caseId,
    actor: { userId: studentUserId, roles: ["STUDENT"] },
    actualStart: new Date("2026-06-01"),
    actualEnd: new Date("2026-07-13"),
  });

  return { caseId, studentUserId, focalUserId: focal.id };
}

/** Continues from `createDocsPendingCase()` through all three BR-10
 * deliverables, both BR-11 verifications, and row 10's mark-verified —
 * everything through the real M06/M08/M09 service functions. Returns a
 * case sitting in VERIFIED, ready for M09's grade-recommend/award tests. */
export async function createVerifiedCase(startSequence: number) {
  const { caseId, studentUserId, focalUserId } = await createDocsPendingCase(startSequence);

  const completionCertificate = await storeDocument({
    caseId,
    type: "COMPLETION_CERTIFICATE",
    file: validPdfFile("certificate.pdf"),
    uploadedBy: studentUserId,
  });

  const { rawToken } = await issueSupervisorToken({
    caseId,
    supervisorEmail: "supervisor@acme.test",
    issuedBy: focalUserId,
  });
  await submitEvaluation({ rawToken, performanceRating: 5, comments: "Great." });
  await advanceToVerificationIfReady(caseId);

  const offerLetter = await prisma.document.findFirstOrThrow({
    where: { caseId, type: "OFFER_LETTER", status: "ACTIVE" },
  });
  await verifyDocument({
    documentId: offerLetter.id,
    method: "DOCUMENT_INSPECTED",
    verifiedBy: focalUserId,
  });
  await verifyDocument({
    documentId: completionCertificate.id,
    method: "DOCUMENT_INSPECTED",
    verifiedBy: focalUserId,
  });

  await markVerified({ caseId, actor: { userId: focalUserId, roles: ["FOCAL"] } });

  return { caseId, studentUserId, focalUserId };
}

/** Continues from `createVerifiedCase()` through a recommend + HoD
 * award of "I" (Incomplete) — a real `CLOSED_INCOMPLETE` case, the only
 * state the restart gate (M10, BR-16) is ever reachable from. The
 * student's admission point carries `createEligibleStudent()`'s default
 * 4 CLOSED semesters, so `semestersRemaining` for G2 is
 * `GRADUATION_BOUNDARY_SEMESTERS - 4` — comfortably >= 1 for every M10
 * test except the dedicated G2 fixture, which builds its own student
 * with a different semester count instead of parameterising this chain. */
export async function createClosedIncompleteCase(startSequence: number) {
  const { caseId, studentUserId, focalUserId } = await createVerifiedCase(startSequence);

  await recommendGrade({
    caseId,
    actor: { userId: focalUserId, roles: ["FOCAL"] },
    value: "I",
    reason: "deliverables did not meet the bar",
  });

  const hod = await createUserFixture();
  await assignRole(hod.id, "HOD");
  await awardGrade({
    caseId,
    actor: { userId: hod.id, roles: ["HOD"] },
    value: "I",
    reason: "confirmed incomplete",
  });

  return { caseId, studentUserId, focalUserId, hodUserId: hod.id };
}
