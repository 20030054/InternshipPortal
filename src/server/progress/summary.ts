/**
 * Pure functions over a case's already-fetched progress log entries —
 * no I/O, so these stay trivially unit-testable the way M03's
 * `computeEligibility()` is. Callers fetch the entries and pass them in.
 */

export type ProgressLogEntryFact = {
  weekNumber: number;
};

/** "Weeks completed" is a count of logged entries, not the highest
 * week number reached — see docs/modules/M07.md "Scope decisions" for
 * why (a skipped week shouldn't be counted as completed). */
export function countWeeksCompleted(entries: readonly ProgressLogEntryFact[]): number {
  return entries.length;
}

/** Reached once any logged entry's weekNumber is at or past the
 * ceiling of half the planned duration — derived from the actual log,
 * never a separately self-declared flag. */
export function hasReachedMidpoint(
  entries: readonly ProgressLogEntryFact[],
  plannedWeeks: number,
): boolean {
  const midpointWeek = Math.ceil(plannedWeeks / 2);
  return entries.some((e) => e.weekNumber >= midpointWeek);
}
