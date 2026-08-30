/**
 * Shared week-math — factored out of M05's `durationWithinBounds` guard
 * so it and M07's variance calculation don't each carry their own copy
 * of "milliseconds per week." Pure, no I/O.
 */

const MILLIS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function weeksBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MILLIS_PER_WEEK;
}

export type DurationVariance = {
  plannedWeeks: number;
  actualWeeks: number;
  /** Signed: positive means the internship ran longer than planned. */
  varianceWeeks: number;
  hasVariance: boolean;
};

/** BR-08: "flags any variance for the Focal Person." Computed on read
 * from planned vs. actual dates — never stored, same "computed, not
 * self-declared" principle as BR-01's eligibility. `hasVariance` is a
 * plain inequality on the rounded week counts, not a tolerance band —
 * `MASTER_PROMPT.md` says "any variance," not "variance beyond some
 * threshold." */
export function computeDurationVariance(
  planned: { start: Date; end: Date },
  actual: { start: Date; end: Date },
): DurationVariance {
  const plannedWeeks = weeksBetween(planned.start, planned.end);
  const actualWeeks = weeksBetween(actual.start, actual.end);
  const varianceWeeks = actualWeeks - plannedWeeks;
  return {
    plannedWeeks,
    actualWeeks,
    varianceWeeks,
    hasVariance: varianceWeeks !== 0,
  };
}
