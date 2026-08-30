import {
  assignRole,
  createClosedSemesterChain,
  createStudentFixture,
} from "./prisma-fixtures";
import { openCase, submitOffer } from "@/server/offers/service";

/**
 * A student with 4 CLOSED semesters at/after admission — BR-01 eligible
 * per `computeEligibility()`.
 *
 * `startSequence` is a required, caller-chosen block, not a random pick
 * or an internal counter — and it matters more than it looks. BR02's
 * sweep and the real GET /api/students/:id/eligibility route both call
 * `computeEligibility()` against *every* CLOSED semester in the database
 * (`prisma.semester.findMany()`, unfiltered), so any CLOSED semester
 * with a `sequenceNumber` at or above *another* test's admission point
 * silently inflates that other test's "semesters completed" count — a
 * large random range (this file's first draft picked one in 300M-900M)
 * avoids the UNIQUE-constraint collision other fixtures worry about, but
 * is *worse* on this specific axis: sitting above every real admission
 * point in the suite means it corrupted BR02_auto_enrollment_sweep and
 * M03_eligibility_route_ownership's counts. Fixed by requiring each
 * caller to reserve its own low, hardcoded block — same
 * "each file owns a disjoint numeric block, low blocks first" convention
 * BR01/BR02/M03's own semester fixtures already use (see those files);
 * every caller of this function keeps a local per-file counter (e.g.
 * `let seq = 2000; const next = () => (seq += 10);`) starting at its
 * reserved block, rather than sharing counter state here — module state
 * in this file would reset per test file anyway (vitest isolates
 * modules per file), so a shared counter here would silently collide
 * across files the same way the random range did.
 */
export async function createEligibleStudent(startSequence: number) {
  const semesters = await createClosedSemesterChain(4, startSequence);
  return createStudentFixture({ admissionSemesterId: semesters[0]!.id });
}

const VALID_OFFER_FIELDS = {
  companyName: "Acme Corp",
  companyContact: "hr@acme.test",
  workDescription: "x".repeat(200),
};

function offerLetterFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "offer.pdf", {
    type: "application/pdf",
  });
}

/** A case already at OFFER_UNDER_REVIEW, ready for approve/reject —
 * everything up to that point goes through the real service functions
 * (openCase/submitOffer), not a fixture shortcut, since BR-08/BR-09
 * tests only care about what happens *at* approval. */
export async function createOfferUnderReviewCase(startSequence: number) {
  const student = await createEligibleStudent(startSequence);
  await assignRole(student.userId, "STUDENT");
  const kase = await openCase(student.id);
  const updated = await submitOffer({
    caseId: kase.id,
    actor: { userId: student.userId, roles: ["STUDENT"] },
    ...VALID_OFFER_FIELDS,
    offerLetterFile: offerLetterFile(),
  });
  return { caseId: updated.id, studentUserId: student.userId };
}
