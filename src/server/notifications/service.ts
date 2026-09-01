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

/** Every user currently holding `role` — originally "no per-case
 * assignment exists anywhere in this schema, so a role-targeted
 * notification always means 'everyone with the role'" (M12); no
 * longer quite true since department scoping (M15, D-127) — this
 * function itself stays role-only (still used for DEAN, which stays
 * unscoped, and for callers that genuinely want every holder), but
 * `resolveRecipients()` below narrows FOCAL/HOD role rules by the
 * case's own department before calling this. */
export async function usersWithRole(role: RoleName): Promise<{ id: string; email: string }[]> {
  const rows = await prisma.userRole.findMany({
    where: { role: { name: role } },
    select: { user: { select: { id: true, email: true } } },
  });
  return rows.map((r) => r.user);
}

const DEPARTMENT_SCOPED_ROLES: readonly RoleName[] = ["FOCAL", "HOD"];

/** Narrows a role-targeted recipient list to just the users assigned
 * to `caseId`'s own department (D-127) — a no-op for any role other
 * than FOCAL/HOD (DEAN stays school-wide) and for a case whose student
 * has no department (fails closed to nobody, same as
 * `requireDepartmentAccess()`'s own default, rather than silently
 * notifying everyone). */
async function narrowToCaseDepartment(
  role: RoleName,
  caseId: string,
  users: { id: string; email: string }[],
): Promise<{ id: string; email: string }[]> {
  if (!DEPARTMENT_SCOPED_ROLES.includes(role)) return users;

  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    select: { student: { select: { department: true } } },
  });
  if (!kase?.student.department) return [];

  const assigned = await prisma.userDepartment.findMany({
    where: { department: kase.student.department, userId: { in: users.map((u) => u.id) } },
    select: { userId: true },
  });
  const assignedIds = new Set(assigned.map((a) => a.userId));
  return users.filter((u) => assignedIds.has(u.id));
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
      const roleUsers = await usersWithRole(rule.role);
      out.push(...(await narrowToCaseDepartment(rule.role, caseId, roleUsers)));
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

/**
 * Runs `fn` over `items` with at most `limit` in flight at once —
 * plain `Promise.all` over every recipient genuinely exhausted
 * Prisma's connection pool (default `num_cpus * 2 + 1`, 9 on the
 * machine this was built on) once a role-targeted template resolved
 * to more than a handful of recipients at the same instant, and the
 * resulting `PrismaClientKnownRequestError: Timed out fetching a new
 * connection from the connection pool` didn't just fail that one
 * delivery — a request still queued on the pool when its own test's
 * timeout fires keeps running in the background and competes with
 * whatever the *next* test needs, which is what actually happened
 * (found for real: an initial unbounded-`Promise.all` version of
 * `sendNotification` made several unrelated, earlier-running waiver
 * tests fail with the same pool-timeout error, well before M14's own
 * large-recipient sweep test even ran). A small fixed concurrency
 * avoids ever asking the pool for more connections than it has,
 * regardless of `DATABASE_URL`'s configured `connection_limit` in any
 * given environment, while still finishing well under the fully
 * sequential 165-case x 123-recipient case this was built against.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Sends to every recipient `template.recipients` resolves to (by role,
 * or "the student on this case"). Delivered with bounded concurrency
 * (`mapWithConcurrency`, M14) rather than one at a time — a
 * role-targeted template with many recipients (every `FOCAL` user,
 * every `HOD` user) previously serialized one create-send-update round
 * trip per recipient, which is fine at a handful of recipients but
 * scales linearly with staff headcount for no reason: each recipient's
 * delivery is already fully independent (`deliver()` catches its own
 * `sendMail()` failure per recipient, so one slow or failing send can't
 * block another). */
export async function sendNotification(
  template: NotificationTemplate,
  caseId: string | null,
  ctx: TemplateContext,
): Promise<void> {
  const recipients = caseId ? await resolveRecipients(caseId, template.recipients) : [];
  await mapWithConcurrency(recipients, 5, (recipient) => deliver(template, caseId, recipient.email, ctx));
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
