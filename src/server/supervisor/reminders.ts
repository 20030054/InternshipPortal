/**
 * BR-28: "If a supervisor has not submitted an evaluation within
 * SUPERVISOR_SLA_DAYS (default 14), the system reminds them twice, then
 * flags the case for Focal Person intervention." Pure classification
 * only — no I/O, no email sending, no BullMQ. The actual reminder
 * delivery is M12's job; this is the detection logic M12's future
 * scheduled job (or an on-demand admin trigger, same "sweep" pattern as
 * M03's BR-02) will call. See docs/modules/M08.md "Scope decisions."
 */

/** Not specified by the master prompt — only the total "twice, then
 * escalate" shape and the initial SUPERVISOR_SLA_DAYS wait are. A
 * defensible default for the gap between the two reminders, logged in
 * DECISIONS.md. */
export const REMINDER_INTERVAL_DAYS = 3;

export type ReminderClassification =
  | "none"
  | "first_reminder_due"
  | "second_reminder_due"
  | "escalate";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export function classifyTokenForReminder(
  token: { createdAt: Date; reminderCount: number },
  now: Date,
  slaDays: number,
): ReminderClassification {
  const ageDays = (now.getTime() - token.createdAt.getTime()) / MILLIS_PER_DAY;

  if (token.reminderCount === 0) {
    return ageDays >= slaDays ? "first_reminder_due" : "none";
  }
  if (token.reminderCount === 1) {
    return ageDays >= slaDays + REMINDER_INTERVAL_DAYS ? "second_reminder_due" : "none";
  }
  // reminderCount >= 2: both reminders already sent.
  return ageDays >= slaDays + 2 * REMINDER_INTERVAL_DAYS ? "escalate" : "none";
}
