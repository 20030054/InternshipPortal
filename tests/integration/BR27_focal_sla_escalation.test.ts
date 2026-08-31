import { describe, expect, it, vi } from "vitest";
import type { CaseState } from "@prisma/client";
import { runFocalSlaSweep } from "@/server/sla/service";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createOfferUnderReviewCase } from "./support/offer-fixtures";
import { createDocsPendingCase } from "./support/case-lifecycle";
import { storeDocument } from "@/server/documents/store";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import { advanceToVerificationIfReady } from "@/server/grading/service";
import { validPdfFile } from "./support/files";
import { prisma } from "@/server/db/client";

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * BR-27. Module done-criterion: "an untouched pending approval
 * escalates on schedule in a time-travelled test." `runFocalSlaSweep()`
 * takes an explicit `now`, travelled forward from the case's own real
 * entry timestamp — not a mutated `CaseEvent.createdAt`, since
 * `case_events` is append-only at the privilege level (`REVOKE UPDATE,
 * DELETE`, M01/BR-26) and `scit_app` genuinely cannot write to it after
 * insert, in tests or in production.
 */
describe("BR-27: Focal Person SLA escalation", () => {
  async function entryTimestamp(caseId: string, toState: CaseState): Promise<Date> {
    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId, toState },
      orderBy: { createdAt: "desc" },
    });
    return event.createdAt;
  }

  it("escalates exactly once per HOD user once past SLA_DAYS, and not again on a re-run", async () => {
    const { caseId } = await createOfferUnderReviewCase(9100);
    const enteredAt = await entryTimestamp(caseId, "OFFER_UNDER_REVIEW");
    const travelledNow = new Date(enteredAt.getTime() + 20 * DAY_MS); // comfortably past 10 working days

    const hodA = await createUserFixture();
    await assignRole(hodA.id, "HOD");
    const hodB = await createUserFixture();
    await assignRole(hodB.id, "HOD");

    const first = await runFocalSlaSweep(travelledNow);
    expect(first.caseIds).toContain(caseId);

    // Every HOD user in the whole (shared) test database gets one -- no
    // per-case assignment (docs/modules/M12.md "Scope decisions") -- so
    // this asserts *these two* are present, not that they're the only
    // recipients, and compares counts by delta rather than a hardcoded
    // total (many other test files also create HOD users).
    const hodAUser = await prisma.user.findUniqueOrThrow({ where: { id: hodA.id } });
    const hodBUser = await prisma.user.findUniqueOrThrow({ where: { id: hodB.id } });
    const notificationA = await prisma.notification.findFirst({
      where: { caseId, templateId: "focal-sla-escalation", recipient: hodAUser.email },
    });
    const notificationB = await prisma.notification.findFirst({
      where: { caseId, templateId: "focal-sla-escalation", recipient: hodBUser.email },
    });
    expect(notificationA?.status).toBe("SENT");
    expect(notificationB?.status).toBe("SENT");

    const countAfterFirstRun = await prisma.notification.count({
      where: { caseId, templateId: "focal-sla-escalation" },
    });

    // Re-running at the same travelled instant produces zero more for
    // this case -- already escalated for this stay.
    const second = await runFocalSlaSweep(travelledNow);
    expect(second.caseIds).not.toContain(caseId);

    const countAfterRerun = await prisma.notification.count({
      where: { caseId, templateId: "focal-sla-escalation" },
    });
    expect(countAfterRerun).toBe(countAfterFirstRun); // unchanged, not duplicated
  });

  it("does not escalate a case still within SLA_DAYS", async () => {
    const { caseId } = await createOfferUnderReviewCase(9120);
    const enteredAt = await entryTimestamp(caseId, "OFFER_UNDER_REVIEW");
    const travelledNow = new Date(enteredAt.getTime() + 2 * DAY_MS); // well within 10 working days

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");

    const result = await runFocalSlaSweep(travelledNow);
    expect(result.caseIds).not.toContain(caseId);
  });

  it("PENDING_VERIFICATION is also a Focal-pending state that can breach", async () => {
    const { caseId, studentUserId, focalUserId } = await createDocsPendingCase(9140);
    await storeDocument({
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

    const enteredAt = await entryTimestamp(caseId, "PENDING_VERIFICATION");
    const travelledNow = new Date(enteredAt.getTime() + 20 * DAY_MS);

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");

    const result = await runFocalSlaSweep(travelledNow);
    expect(result.caseIds).toContain(caseId);
  });
});
