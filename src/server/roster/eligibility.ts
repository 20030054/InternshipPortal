/**
 * BR-01 / BR-04: eligibility and the graduation clock are pure functions
 * of a student's admission semester and the roster's semester data —
 * never a stored column (see docs/modules/M03.md "Business rules
 * enforced"). No I/O here; callers fetch the semester rows and pass in
 * plain data, so this stays trivially unit-testable.
 */

export const ELIGIBILITY_THRESHOLD_SEMESTERS = 4;
export const AUTO_ENROLL_BOUNDARY_SEMESTERS = 6;

/** G2 (BR-17)/M10: the total program length in semesters, used only to
 * compute how many remain before graduation. `MASTER_PROMPT.md` never
 * states this directly — the only textual anchor anywhere in the
 * document is §15's seed-data line, "students across semesters 3 to 8,"
 * which reads as the intended full range of a normal, still-enrolled
 * student for a standard 4-year/8-semester BS program. This is an
 * inference from a demo-data hint, not a stated fact — see OQ-13 in
 * docs/OPEN_QUESTIONS.md. A smaller number would make G2 harder to pass
 * (more restrictive) but would contradict the seed data's own claim that
 * semester 8 is still a normal enrolled semester, so 8 is both the
 * textually-grounded and the appropriately restrictive choice available
 * without an HoD-confirmed answer. */
export const GRADUATION_BOUNDARY_SEMESTERS = 8;

export type SemesterFact = {
  id: string;
  sequenceNumber: number;
  status: "UPCOMING" | "OPEN" | "CLOSED";
};

export type EligibilityResult = {
  /** Count of CLOSED semesters at or after the admission semester. A
   * semester still OPEN or UPCOMING never counts, regardless of its date
   * range — see docs/modules/M03.md's "current semester" scope note. */
  semestersCompleted: number;
  /** BR-01: eligible once >= 4 semesters are completed. */
  isEligible: boolean;
  /** BR-02: crossed the semester-6 boundary — a candidate for the
   * auto-enrollment sweep if they still have no case at all. */
  isPastAutoEnrollBoundary: boolean;
};

/**
 * `allSemesters` should be every semester row in the system (or at least
 * every one from the admission semester onward) — the function itself
 * doesn't fetch anything, so it can't accidentally miss a semester a
 * caller forgot to include; that's the caller's responsibility, made
 * explicit by this parameter rather than hidden inside a DB query here.
 */
export function computeEligibility(
  admissionSemesterId: string,
  allSemesters: readonly SemesterFact[],
): EligibilityResult {
  const admission = allSemesters.find((s) => s.id === admissionSemesterId);
  if (!admission) {
    throw new Error(
      `admissionSemesterId ${admissionSemesterId} is not present in the supplied semester list`,
    );
  }

  const semestersCompleted = allSemesters.filter(
    (s) =>
      s.sequenceNumber >= admission.sequenceNumber && s.status === "CLOSED",
  ).length;

  return {
    semestersCompleted,
    isEligible: semestersCompleted >= ELIGIBILITY_THRESHOLD_SEMESTERS,
    isPastAutoEnrollBoundary:
      semestersCompleted >= AUTO_ENROLL_BOUNDARY_SEMESTERS,
  };
}

/** G2 (BR-17)/M10: full semesters remaining before
 * `GRADUATION_BOUNDARY_SEMESTERS`, built on `computeEligibility()`'s own
 * `semestersCompleted` rather than re-deriving it — same admission
 * semester, same roster data, one extra subtraction. Can be zero or
 * negative (a student already past the boundary); `timeRemains` (M04)
 * fails whenever this is below 1. */
export function semestersRemainingBeforeGraduation(
  semestersCompleted: number,
): number {
  return GRADUATION_BOUNDARY_SEMESTERS - semestersCompleted;
}
