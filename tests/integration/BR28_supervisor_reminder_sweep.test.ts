import { describe, expect, it, vi } from "vitest";
import { runSupervisorReminderSweep } from "@/server/sla/service";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createDocsPendingCase } from "./support/case-lifecycle";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import { prisma } from "@/server/db/client";

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

/** BR-28: M08 already built the detection logic
 * (`classifyTokenForReminder()`) — this is the delivery side's own
 * test, exercising `runSupervisorReminderSweep()` against real,
 * time-travelled `SupervisorToken` rows. */
describe("BR-28: supervisor reminder sweep", () => {
  async function tokenAgedDays(daysAgo: number, reminderCount: number, startSequence: number) {
    const { caseId, focalUserId } = await createDocsPendingCase(startSequence);
    const { token } = await issueSupervisorToken({
      caseId,
      supervisorEmail: `supervisor-${startSequence}@acme.test`,
      issuedBy: focalUserId,
    });
    await prisma.supervisorToken.update({
      where: { id: token.id },
      data: {
        createdAt: new Date(Date.now() - daysAgo * DAY_MS),
        reminderCount,
      },
    });
    return { caseId, tokenId: token.id, focalUserId, supervisorEmail: token.supervisorEmail };
  }

  it("sends the first reminder once past SUPERVISOR_SLA_DAYS and bumps reminderCount", async () => {
    const { tokenId, supervisorEmail } = await tokenAgedDays(15, 0, 9200);

    const result = await runSupervisorReminderSweep();
    expect(result.firstReminders).toBe(1);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { templateId: "supervisor-first-reminder", recipient: supervisorEmail },
    });
    expect(notification.status).toBe("SENT");

    const updated = await prisma.supervisorToken.findUniqueOrThrow({ where: { id: tokenId } });
    expect(updated.reminderCount).toBe(1);
    expect(updated.lastReminderSentAt).not.toBeNull();
  });

  it("sends the second reminder once past SLA_DAYS + REMINDER_INTERVAL_DAYS with reminderCount 1", async () => {
    const { tokenId, supervisorEmail } = await tokenAgedDays(18, 1, 9220);

    const result = await runSupervisorReminderSweep();
    expect(result.secondReminders).toBe(1);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { templateId: "supervisor-second-reminder", recipient: supervisorEmail },
    });
    expect(notification.status).toBe("SENT");

    const updated = await prisma.supervisorToken.findUniqueOrThrow({ where: { id: tokenId } });
    expect(updated.reminderCount).toBe(2);
  });

  it("escalates to every FOCAL user once past both reminders, and does not re-escalate on a re-run", async () => {
    const { caseId } = await tokenAgedDays(21, 2, 9240);
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");

    const first = await runSupervisorReminderSweep();
    expect(first.escalations).toBeGreaterThanOrEqual(1);

    // Every FOCAL user in the whole (shared) test database gets one --
    // no per-case assignment (docs/modules/M12.md "Scope decisions") --
    // so this asserts *this* one is present, not that it's the only
    // recipient.
    const focalUser = await prisma.user.findUniqueOrThrow({ where: { id: focal.id } });
    const notification = await prisma.notification.findFirst({
      where: { caseId, templateId: "supervisor-unresponsive", recipient: focalUser.email },
    });
    expect(notification).not.toBeNull();
    expect(notification?.status).toBe("SENT");

    const countAfterFirstRun = await prisma.notification.count({
      where: { caseId, templateId: "supervisor-unresponsive" },
    });

    await runSupervisorReminderSweep();

    // Scoped to this case specifically, and compared by delta rather
    // than a hardcoded total -- every FOCAL user in the whole (shared)
    // test database gets one, and many other test files also create
    // FOCAL users.
    const countAfterRerun = await prisma.notification.count({
      where: { caseId, templateId: "supervisor-unresponsive" },
    });
    expect(countAfterRerun).toBe(countAfterFirstRun); // not duplicated on the re-run
  });

  it("does not remind a token still within SUPERVISOR_SLA_DAYS", async () => {
    const { tokenId } = await tokenAgedDays(2, 0, 9260);
    await runSupervisorReminderSweep();
    const updated = await prisma.supervisorToken.findUniqueOrThrow({ where: { id: tokenId } });
    expect(updated.reminderCount).toBe(0);
  });

  it("never reminds a token whose evaluation has already been submitted (usedAt set)", async () => {
    const { caseId, focalUserId } = await createDocsPendingCase(9280);
    const { token, rawToken } = await issueSupervisorToken({
      caseId,
      supervisorEmail: "already-submitted@acme.test",
      issuedBy: focalUserId,
    });
    await submitEvaluation({ rawToken, performanceRating: 5, comments: "Great." });
    await prisma.supervisorToken.update({
      where: { id: token.id },
      data: { createdAt: new Date(Date.now() - 30 * DAY_MS) },
    });

    await runSupervisorReminderSweep();
    const notification = await prisma.notification.findFirst({
      where: { recipient: "already-submitted@acme.test" },
    });
    expect(notification).toBeNull();
  });
});
