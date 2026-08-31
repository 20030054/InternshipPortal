import { describe, expect, it, vi } from "vitest";
import { dispatchTransitionNotification } from "@/server/notifications/service";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createOfferUnderReviewCase } from "./support/offer-fixtures";
import { approveOffer } from "@/server/offers/service";
import { prisma } from "@/server/db/client";

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

/** M12: the generic `executeTransition()` hook + the worker-side
 * handler it feeds. Exercises `dispatchTransitionNotification()`
 * directly (what the `case-notifications` worker calls) rather than
 * relying on a live BullMQ worker process during the test run — the
 * enqueue call itself (executor.ts) is already exercised for real by
 * every transition every other integration test performs. */
describe("M12: case-notifications dispatch", () => {
  it("OFFER_APPROVED notifies the student, templated and logged", async () => {
    const { caseId, studentUserId } = await createOfferUnderReviewCase(9000);
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

    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId, toState: "APPROVED" },
      orderBy: { createdAt: "desc" },
    });

    await dispatchTransitionNotification(event.id, "OFFER_APPROVED");

    const student = await prisma.user.findUniqueOrThrow({ where: { id: studentUserId } });
    const notification = await prisma.notification.findFirstOrThrow({
      where: { caseId, templateId: "offer-approved" },
    });
    expect(notification.recipient).toBe(student.email);
    expect(notification.status).toBe("SENT");
    expect(notification.templateVersion).toBe(1);
    expect(notification.sentAt).not.toBeNull();
  });

  it("OFFER_QUEUED_FOR_REVIEW notifies every FOCAL user, including ones created just for this test", async () => {
    const { caseId } = await createOfferUnderReviewCase(9020);
    const focalA = await createUserFixture();
    await assignRole(focalA.id, "FOCAL");
    const focalB = await createUserFixture();
    await assignRole(focalB.id, "FOCAL");

    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId, toState: "OFFER_UNDER_REVIEW" },
      orderBy: { createdAt: "desc" },
    });

    await dispatchTransitionNotification(event.id, "OFFER_QUEUED_FOR_REVIEW");

    // Every FOCAL user in the whole (shared) test database gets one --
    // there is no per-case assignment (docs/modules/M12.md "Scope
    // decisions") -- so this only asserts *these two* are present, not
    // that they're the only recipients.
    const focalAUser = await prisma.user.findUniqueOrThrow({ where: { id: focalA.id } });
    const focalBUser = await prisma.user.findUniqueOrThrow({ where: { id: focalB.id } });
    const notificationA = await prisma.notification.findFirst({
      where: { caseId, templateId: "offer-queued-for-review", recipient: focalAUser.email },
    });
    const notificationB = await prisma.notification.findFirst({
      where: { caseId, templateId: "offer-queued-for-review", recipient: focalBUser.email },
    });
    expect(notificationA).not.toBeNull();
    expect(notificationB).not.toBeNull();
  });

  it("a deliberately silent event (ALL_DELIVERABLES_VERIFIED) produces zero notifications", async () => {
    const { caseId } = await createOfferUnderReviewCase(9040);
    const before = await prisma.notification.count({ where: { caseId } });

    // Doesn't need a real CaseEvent -- the template lookup short-circuits
    // before ever loading one for a recipients:[] entry.
    await dispatchTransitionNotification("00000000-0000-7000-8000-000000000000", "ALL_DELIVERABLES_VERIFIED");

    const after = await prisma.notification.count({ where: { caseId } });
    expect(after).toBe(before);
  });

  it("an unregistered event is a silent no-op, not a throw", async () => {
    await expect(
      dispatchTransitionNotification("00000000-0000-7000-8000-000000000000", "SOME_UNKNOWN_EVENT"),
    ).resolves.toBeUndefined();
  });
});
