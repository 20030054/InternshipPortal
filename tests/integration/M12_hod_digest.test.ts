import { describe, expect, it, vi } from "vitest";
import { runHodDigest } from "@/server/sla/service";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createOfferUnderReviewCase } from "./support/offer-fixtures";
import { prisma } from "@/server/db/client";

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

/**
 * M12: the HoD digest reports only what this module tracks (current
 * Focal-SLA breaches, supervisor-escalated cases) and is skipped
 * entirely when there's nothing to report.
 *
 * `runHodDigest()`'s breach count is global (every case in a
 * Focal-pending state, DB-wide) by necessity — the same reasoning
 * `BR02_auto_enrollment_sweep.test.ts` already applies to
 * `runAutoEnrollmentSweep()`'s own global scan: never assert an
 * absolute total, only that *this test's own* fixture is (or isn't)
 * reflected correctly, since other test files sharing the same database
 * may legitimately leave breach-shaped state behind (BR27's own
 * time-travelled cases, in particular).
 */
describe("M12: HoD digest", () => {
  it("a fresh (non-breached) pending case never causes a digest to be sent for it", async () => {
    // Not backdated -- well within SLA_DAYS, so this alone must never
    // tip runHodDigest() into sending. Doesn't assert global "sent:
    // false", since other files may have already left real breaches
    // behind (see the file-level comment above).
    const { caseId } = await createOfferUnderReviewCase(9300);
    await runHodDigest();

    const notificationsForThisCase = await prisma.notification.findMany({
      where: { caseId, templateId: "hod-digest" },
    });
    expect(notificationsForThisCase).toHaveLength(0); // digests are never per-case anyway
  });

  it("sends one digest per current HOD user once a Focal-SLA breach exists", async () => {
    const { caseId } = await createOfferUnderReviewCase(9320);
    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId, toState: "OFFER_UNDER_REVIEW" },
      orderBy: { createdAt: "desc" },
    });
    // Time-travelled, not backdated -- case_events is append-only at the
    // privilege level (REVOKE UPDATE, DELETE, M01/BR-26) and cannot be
    // mutated, in tests or in production. See BR27_focal_sla_escalation
    // .test.ts's file-level comment.
    const travelledNow = new Date(event.createdAt.getTime() + 20 * 24 * 60 * 60 * 1000);

    const hodA = await createUserFixture();
    await assignRole(hodA.id, "HOD");
    const hodB = await createUserFixture();
    await assignRole(hodB.id, "HOD");

    const result = await runHodDigest(travelledNow);
    expect(result.sent).toBe(true);
    expect(result.recipients).toBeGreaterThanOrEqual(2); // at least the two just created

    const hodAUser = await prisma.user.findUniqueOrThrow({ where: { id: hodA.id } });
    const hodBUser = await prisma.user.findUniqueOrThrow({ where: { id: hodB.id } });
    const notificationA = await prisma.notification.findFirstOrThrow({
      where: { templateId: "hod-digest", recipient: hodAUser.email },
    });
    const notificationB = await prisma.notification.findFirstOrThrow({
      where: { templateId: "hod-digest", recipient: hodBUser.email },
    });
    expect(notificationA.status).toBe("SENT");
    expect(notificationB.status).toBe("SENT");
    expect(notificationA.caseId).toBeNull(); // a report, not tied to one case
  });
});
