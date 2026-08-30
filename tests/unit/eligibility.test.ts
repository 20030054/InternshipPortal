import { describe, expect, it } from "vitest";
import {
  computeEligibility,
  AUTO_ENROLL_BOUNDARY_SEMESTERS,
  ELIGIBILITY_THRESHOLD_SEMESTERS,
  type SemesterFact,
} from "@/server/roster/eligibility";

function semester(
  id: string,
  sequenceNumber: number,
  status: SemesterFact["status"],
): SemesterFact {
  return { id, sequenceNumber, status };
}

describe("computeEligibility (BR-01/BR-02/BR-04)", () => {
  it("throws if the admission semester isn't in the supplied list", () => {
    expect(() => computeEligibility("missing", [])).toThrow();
  });

  it("counts zero completed semesters when only the admission semester itself is closed and nothing follows", () => {
    const semesters = [semester("s1", 1, "CLOSED")];
    const result = computeEligibility("s1", semesters);
    expect(result.semestersCompleted).toBe(1);
    expect(result.isEligible).toBe(false);
  });

  it(`is not eligible with ${ELIGIBILITY_THRESHOLD_SEMESTERS - 1} closed semesters since admission`, () => {
    const semesters = [
      semester("s1", 1, "CLOSED"),
      semester("s2", 2, "CLOSED"),
      semester("s3", 3, "CLOSED"),
    ];
    const result = computeEligibility("s1", semesters);
    expect(result.semestersCompleted).toBe(3);
    expect(result.isEligible).toBe(false);
  });

  it(`is eligible with exactly ${ELIGIBILITY_THRESHOLD_SEMESTERS} closed semesters since admission`, () => {
    const semesters = [
      semester("s1", 1, "CLOSED"),
      semester("s2", 2, "CLOSED"),
      semester("s3", 3, "CLOSED"),
      semester("s4", 4, "CLOSED"),
    ];
    const result = computeEligibility("s1", semesters);
    expect(result.semestersCompleted).toBe(4);
    expect(result.isEligible).toBe(true);
    expect(result.isPastAutoEnrollBoundary).toBe(false);
  });

  it("a semester still OPEN never counts as completed, regardless of its date range", () => {
    const semesters = [
      semester("s1", 1, "CLOSED"),
      semester("s2", 2, "CLOSED"),
      semester("s3", 3, "CLOSED"),
      semester("s4", 4, "OPEN"),
    ];
    const result = computeEligibility("s1", semesters);
    expect(result.semestersCompleted).toBe(3);
    expect(result.isEligible).toBe(false);
  });

  it("a semester still UPCOMING never counts as completed", () => {
    const semesters = [
      semester("s1", 1, "CLOSED"),
      semester("s2", 2, "CLOSED"),
      semester("s3", 3, "CLOSED"),
      semester("s4", 4, "CLOSED"),
      semester("s5", 5, "UPCOMING"),
    ];
    const result = computeEligibility("s1", semesters);
    expect(result.semestersCompleted).toBe(4);
  });

  it(`crosses the auto-enrollment boundary at exactly ${AUTO_ENROLL_BOUNDARY_SEMESTERS} closed semesters`, () => {
    const semesters = Array.from({ length: 6 }, (_, i) =>
      semester(`s${i + 1}`, i + 1, "CLOSED"),
    );
    const result = computeEligibility("s1", semesters);
    expect(result.semestersCompleted).toBe(6);
    expect(result.isPastAutoEnrollBoundary).toBe(true);
  });

  it("does not cross the auto-enrollment boundary at 5 closed semesters", () => {
    const semesters = Array.from({ length: 5 }, (_, i) =>
      semester(`s${i + 1}`, i + 1, "CLOSED"),
    );
    const result = computeEligibility("s1", semesters);
    expect(result.semestersCompleted).toBe(5);
    expect(result.isPastAutoEnrollBoundary).toBe(false);
  });

  it("ignores semesters before the admission semester's sequence number", () => {
    const semesters = [
      semester("before", 1, "CLOSED"),
      semester("admission", 5, "CLOSED"),
      semester("after", 6, "CLOSED"),
    ];
    const result = computeEligibility("admission", semesters);
    // Only "admission" (seq 5) and "after" (seq 6) count -- "before" (seq
    // 1) predates the student and must never count toward their clock.
    expect(result.semestersCompleted).toBe(2);
  });
});
