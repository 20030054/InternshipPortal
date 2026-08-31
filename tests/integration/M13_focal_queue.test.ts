import { describe, expect, it } from "vitest";
import { getFocalWorkQueue } from "@/server/dashboards/focal-queue";
import { createOfferUnderReviewCase, createEligibleStudent } from "./support/offer-fixtures";
import { createDocsPendingCase } from "./support/case-lifecycle";
import { storeDocument } from "@/server/documents/store";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import { advanceToVerificationIfReady } from "@/server/grading/service";
import { validPdfFile } from "./support/files";
import { prisma } from "@/server/db/client";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("M13: Focal work queue (§10 -- sorted by SLA risk, not by date)", () => {
  it("includes a case in OFFER_UNDER_REVIEW and one in PENDING_VERIFICATION, excludes everything else", async () => {
    const { caseId: reviewCaseId } = await createOfferUnderReviewCase(42100);

    const { caseId: docsCaseId, studentUserId, focalUserId } = await createDocsPendingCase(42120);
    const cert = await storeDocument({
      caseId: docsCaseId,
      type: "COMPLETION_CERTIFICATE",
      file: validPdfFile("cert.pdf"),
      uploadedBy: studentUserId,
    });
    const { rawToken } = await issueSupervisorToken({
      caseId: docsCaseId,
      supervisorEmail: "supervisor@acme.test",
      issuedBy: focalUserId,
    });
    await submitEvaluation({ rawToken, performanceRating: 5, comments: "Great." });
    await advanceToVerificationIfReady(docsCaseId);
    void cert;

    // A case that isn't Focal-pending at all -- must never appear. A
    // fresh, independent student -- cases_one_nonterminal_per_student
    // (M01) blocks a second non-terminal case for a student who already
    // has one, so this can't just reuse reviewCaseId's own student.
    const otherStudent = await createEligibleStudent(42250);
    const eligibleOnly = await prisma.case.create({
      data: { studentId: otherStudent.id, state: "ELIGIBLE" },
    });

    const queue = await getFocalWorkQueue();
    const caseIds = queue.map((r) => r.caseId);
    expect(caseIds).toContain(reviewCaseId);
    expect(caseIds).toContain(docsCaseId);
    expect(caseIds).not.toContain(eligibleOnly.id);

    const reviewRow = queue.find((r) => r.caseId === reviewCaseId);
    expect(reviewRow?.state).toBe("OFFER_UNDER_REVIEW");
    const verificationRow = queue.find((r) => r.caseId === docsCaseId);
    expect(verificationRow?.state).toBe("PENDING_VERIFICATION");
  });

  it("the returned queue is always sorted by working-days-waiting, descending (§10: most overdue first)", async () => {
    // case_events is append-only (can't backdate it directly -- see
    // docs/DECISIONS.md D-077), so a genuine age differential between
    // two rows can't be constructed in a unit-of-milliseconds test
    // window. Asserting the sort invariant itself, against whatever
    // real rows exist (including from other tests sharing this
    // database), is what's actually reliable to check here.
    await createOfferUnderReviewCase(42140);
    await createOfferUnderReviewCase(42160);

    const queue = await getFocalWorkQueue();
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i - 1]!.workingDaysWaiting).toBeGreaterThanOrEqual(queue[i]!.workingDaysWaiting);
    }
  });

  it("marks a case breached once working days waiting reaches SLA_DAYS", async () => {
    const { caseId } = await createOfferUnderReviewCase(42180);
    const entryEvent = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId, toState: "OFFER_UNDER_REVIEW" },
      orderBy: { createdAt: "desc" },
    });
    const travelledNow = new Date(entryEvent.createdAt.getTime() + 20 * DAY_MS);

    const queue = await getFocalWorkQueue(travelledNow);
    const row = queue.find((r) => r.caseId === caseId);
    expect(row?.breached).toBe(true);
  });

  it("does not mark a fresh case breached", async () => {
    const { caseId } = await createOfferUnderReviewCase(42200);
    const queue = await getFocalWorkQueue();
    const row = queue.find((r) => r.caseId === caseId);
    expect(row?.breached).toBe(false);
  });
});
