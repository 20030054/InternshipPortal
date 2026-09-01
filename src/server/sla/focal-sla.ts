/**
 * BR-27: "If a Focal Person leaves an approval or verification pending
 * beyond SLA_DAYS (default 10 working days)..." Pure, no I/O — mirrors
 * M08's `classifyTokenForReminder()` shape (docs/modules/M08.md /
 * src/server/supervisor/reminders.ts). The holiday set is a plain
 * `ReadonlySet<string>` of `YYYY-MM-DD` dates the *caller* fetches
 * (`@/server/roster/holidays`'s `listHolidayDateStrings()`) — keeping
 * this file itself free of I/O, same reason `computeEligibility()`
 * takes its semester list as a parameter rather than querying for it.
 *
 * OQ-14, answered (D-121): "working days" excludes Saturday/Sunday
 * *and* whatever Admin-managed dates are in `public_holidays` — before
 * this, no BNU holiday calendar existed anywhere and every day but the
 * weekend counted, the more restrictive reading absent a real answer.
 * A missing/empty holiday set (the default) reproduces that exact
 * prior behaviour, so every existing caller and test that doesn't pass
 * one is unaffected.
 */

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday, Saturday
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isNonWorkingDay(date: Date, holidays: ReadonlySet<string>): boolean {
  return isWeekend(date) || holidays.has(toDateKey(date));
}

/** Whole calendar days elapsed between `from` and `to` that fall on a
 * weekend or a configured holiday — used to subtract non-working time
 * from a raw elapsed-days count. Iterates one UTC calendar day at a
 * time; SLA windows are a handful of weeks at most, so this is always
 * a small, bounded loop. */
function countNonWorkingDaysBetween(
  from: Date,
  to: Date,
  holidays: ReadonlySet<string>,
): number {
  let count = 0;
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor.getTime() < end.getTime()) {
    if (isNonWorkingDay(cursor, holidays)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Fractional working days elapsed between `from` and `to` (`to` after
 * `from`, or 0 if not). Mirrors `classifyTokenForReminder()`'s
 * fractional-day precision rather than only counting whole days. */
export function workingDaysElapsed(
  from: Date,
  to: Date,
  holidays: ReadonlySet<string> = new Set(),
): number {
  const totalDays = (to.getTime() - from.getTime()) / MILLIS_PER_DAY;
  if (totalDays <= 0) return 0;
  const nonWorkingDays = countNonWorkingDaysBetween(from, to, holidays);
  return Math.max(0, totalDays - nonWorkingDays);
}

export function isFocalSlaBreached(
  enteredStateAt: Date,
  now: Date,
  slaDays: number,
  holidays: ReadonlySet<string> = new Set(),
): boolean {
  return workingDaysElapsed(enteredStateAt, now, holidays) >= slaDays;
}
