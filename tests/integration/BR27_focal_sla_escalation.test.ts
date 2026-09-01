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
import { addHoliday, removeHoliday } from "@/server/roster/holidays";

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

  it("OQ-14 (D-121): a configured holiday genuinely changes the real sweep's outcome, not just the pure function", async () => {
    const { caseId } = await createOfferUnderReviewCase(9130);
    const enteredAt = await entryTimestamp(caseId, "OFFER_UNDER_REVIEW");
    // 14 calendar days always contains exactly 2 Saturdays + 2 Sundays
    // (14 = 2×7, so the count is alignment-independent) -> exactly 10
    // working days elapsed with no holidays configured, right at
    // BR-27's >= threshold — the same margin the "escalates exactly
    // once" test above proves *does* breach with no holidays involved.
    const travelledNow = new Date(enteredAt.getTime() + 14 * DAY_MS);

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");

    // Mark every day in a full 7-consecutive-day window (days 4-10
    // after entry) as a holiday — any 7 consecutive calendar days
    // contain exactly 5 real weekdays regardless of alignment, so this
    // is guaranteed to exclude 5 more working days without depending
    // on which day of the week the test happens to run on. The 2
    // weekend days inside that window get marked too, harmlessly
    // (already excluded either way — see the "double-counts as
    // nothing extra" unit test in focal-sla.test.ts).
    //
    // `public_holidays` is global, shared-database state, not scoped
    // to this test or this case — `enteredAt` is a real insertion
    // timestamp close to actual "now," which lands these dates inside
    // the same near-term calendar window other SLA-sweep tests
    // (running against the same shared database, same real "now")
    // also travel through. Cleaned up in `finally` so this test can't
    // leak holidays into anything else's SLA math — found live, the
    // hard way, the first time this ran (it broke two unrelated
    // tests' breach assertions elsewhere in this same suite run).
    const holidayIds: string[] = [];
    try {
      for (let i = 4; i <= 10; i++) {
        const holiday = await addHoliday(
          new Date(enteredAt.getTime() + i * DAY_MS),
          `test holiday day ${i}`,
        );
        holidayIds.push(holiday.id);
      }

      const result = await runFocalSlaSweep(travelledNow);
      expect(result.caseIds).not.toContain(caseId);
    } finally {
      for (const id of holidayIds) {
        await removeHoliday(id);
      }
    }
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
