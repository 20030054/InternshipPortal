/**
 * BR-01 / BR-04: eligibility and the graduation clock are pure functions
 * of a student's admission semester and the roster's semester data —
 * never a stored column (see docs/modules/M03.md "Business rules
 * enforced"). No I/O here; callers fetch the semester rows and pass in
 * plain data, so this stays trivially unit-testable.
 */

export const ELIGIBILITY_THRESHOLD_SEMESTERS = 4;
export const AUTO_ENROLL_BOUNDARY_SEMESTERS = 6;

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
