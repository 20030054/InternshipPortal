import type { RoleName } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { sendMail } from "@/server/mail/transport";
import {
  templateForEvent,
  WAIVER_INITIATED_TEMPLATE,
  type NotificationTemplate,
  type RecipientRule,
  type TemplateContext,
} from "./templates";

/** Every user currently holding `role` — no per-case assignment exists
 * anywhere in this schema, so a role-targeted notification always means
 * "everyone with the role." See docs/modules/M12.md "Scope decisions." */
export async function usersWithRole(role: RoleName): Promise<{ id: string; email: string }[]> {
  const rows = await prisma.userRole.findMany({
    where: { role: { name: role } },
    select: { user: { select: { id: true, email: true } } },
  });
  return rows.map((r) => r.user);
}

async function studentEmailForCase(caseId: string): Promise<{ id: string; email: string } | null> {
  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    select: { student: { select: { user: { select: { id: true, email: true } } } } },
  });
  return kase?.student.user ?? null;
}

async function resolveRecipients(
  caseId: string,
  rules: readonly RecipientRule[],
): Promise<{ id: string; email: string }[]> {
  const out: { id: string; email: string }[] = [];
  for (const rule of rules) {
    if (rule.kind === "student") {
      const student = await studentEmailForCase(caseId);
      if (student) out.push(student);
    } else {
      out.push(...(await usersWithRole(rule.role)));
    }
  }
  return out;
}

/** Logs the `Notification` row (`QUEUED` before the attempt,
 * `SENT`/`FAILED` after) and makes the one `sendMail()` attempt.
 * Deliberately no BullMQ retry on failure — see docs/modules/M12.md
 * "Scope decisions" for why a `FAILED` row is the honest outcome here,
 * not a silent retry of a possibly-stale email hours later. */
async function deliver(
  template: NotificationTemplate,
  caseId: string | null,
  recipientEmail: string,
  ctx: TemplateContext,
): Promise<void> {
  const { subject, text } = template.render(ctx);
  const notification = await prisma.notification.create({
    data: {
      templateId: template.id,
      templateVersion: template.version,
      recipient: recipientEmail,
      caseId,
      status: "QUEUED",
    },
  });
  try {
    await sendMail({ to: recipientEmail, subject, text });
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: "FAILED" },
    });
  }
}

/** Sends to every recipient `template.recipients` resolves to (by role,
 * or "the student on this case"). */
export async function sendNotification(
  template: NotificationTemplate,
  caseId: string | null,
  ctx: TemplateContext,
): Promise<void> {
  const recipients = caseId ? await resolveRecipients(caseId, template.recipients) : [];
  for (const recipient of recipients) {
    await deliver(template, caseId, recipient.email, ctx);
  }
}

/** Sends to one explicit email address, bypassing role/case
 * resolution — BR-28's supervisor reminders go to
 * `SupervisorToken.supervisorEmail`, a plain string with no `User` row
 * behind it at all (the supervisor is an external party, never a
 * system account). */
export async function sendNotificationToAddress(
  template: NotificationTemplate,
  caseId: string | null,
  recipientEmail: string,
  ctx: TemplateContext,
): Promise<void> {
  await deliver(template, caseId, recipientEmail, ctx);
}

/** The `case-notifications` worker handler — one job per transition
 * (enqueued at the end of `executeTransition()`, M04, which already
 * knows its own row's `emitsEvent` and just-created `CaseEvent` id;
 * `case_events` itself has no `event_type` column — that's
 * `audit_events`' job — so `emitsEvent` travels in the job payload
 * rather than being re-derived from the `CaseEvent` row). Silently
 * no-ops if no template is registered for the event, or the
 * `CaseEvent` no longer exists (defensive; should never happen against
 * the real table). */
export async function dispatchTransitionNotification(
  caseEventId: string,
  emitsEvent: string,
): Promise<void> {
  const template = templateForEvent(emitsEvent);
  if (!template || template.recipients.length === 0) return;

  const event = await prisma.caseEvent.findUnique({ where: { id: caseEventId } });
  if (!event) return;

  await sendNotification(template, event.caseId, {
    caseId: event.caseId,
    fromState: event.fromState,
    toState: event.toState,
    reason: event.reason,
  });
}

/** BR-21/M11: `initiateWaiver()` is a genesis insert and never calls
 * `executeTransition()`, so it has no `CaseEvent`/`emitsEvent` for the
 * generic hook to pick up — called directly instead. */
export async function notifyWaiverInitiated(caseId: string): Promise<void> {
  await sendNotification(WAIVER_INITIATED_TEMPLATE, caseId, {
    caseId,
    fromState: "",
    toState: "WAIVER_REQUESTED",
    reason: null,
  });
}
