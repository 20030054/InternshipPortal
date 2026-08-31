/**
 * BR-27: "If a Focal Person leaves an approval or verification pending
 * beyond SLA_DAYS (default 10 working days)..." Pure, no I/O — mirrors
 * M08's `classifyTokenForReminder()` shape (docs/modules/M08.md /
 * src/server/supervisor/reminders.ts).
 *
 * "Working days" excludes only Saturday/Sunday — no BNU holiday
 * calendar exists anywhere in this build's scaffolding, and not
 * excluding extra holidays is the more restrictive reading for BR-27's
 * purpose (protects the student more, not less). See OQ-14 and
 * docs/modules/M12.md "Scope decisions."
 */

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday, Saturday
}

/** Whole calendar days elapsed between `from` and `to` that fall on a
 * weekend — used to subtract weekend time from a raw elapsed-days
 * count. Iterates one UTC calendar day at a time; SLA windows are a
 * handful of weeks at most, so this is always a small, bounded loop. */
function countWeekendDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor.getTime() < end.getTime()) {
    if (isWeekend(cursor)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Fractional working days elapsed between `from` and `to` (`to` after
 * `from`, or 0 if not). Mirrors `classifyTokenForReminder()`'s
 * fractional-day precision rather than only counting whole days. */
export function workingDaysElapsed(from: Date, to: Date): number {
  const totalDays = (to.getTime() - from.getTime()) / MILLIS_PER_DAY;
  if (totalDays <= 0) return 0;
  const weekendDays = countWeekendDaysBetween(from, to);
  return Math.max(0, totalDays - weekendDays);
}

export function isFocalSlaBreached(
  enteredStateAt: Date,
  now: Date,
  slaDays: number,
): boolean {
  return workingDaysElapsed(enteredStateAt, now) >= slaDays;
}
