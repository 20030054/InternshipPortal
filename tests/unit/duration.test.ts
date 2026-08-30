import { describe, expect, it } from "vitest";
import { computeDurationVariance, weeksBetween } from "@/server/progress/duration";

describe("weeksBetween", () => {
  it("computes a whole-week span", () => {
    expect(weeksBetween(new Date("2026-06-01"), new Date("2026-06-15"))).toBe(2);
  });

  it("computes a fractional span", () => {
    expect(weeksBetween(new Date("2026-06-01"), new Date("2026-06-04"))).toBeCloseTo(
      3 / 7,
    );
  });

  it("returns a negative number when end precedes start", () => {
    expect(weeksBetween(new Date("2026-06-15"), new Date("2026-06-01"))).toBeLessThan(0);
  });
});

describe("computeDurationVariance", () => {
  it("reports no variance when actual matches planned exactly", () => {
    const planned = { start: new Date("2026-06-01"), end: new Date("2026-07-13") };
    const actual = { start: new Date("2026-06-01"), end: new Date("2026-07-13") };

    const result = computeDurationVariance(planned, actual);
    expect(result.plannedWeeks).toBe(6);
    expect(result.actualWeeks).toBe(6);
    expect(result.varianceWeeks).toBe(0);
    expect(result.hasVariance).toBe(false);
  });

  it("reports a positive variance when the internship ran longer", () => {
    const planned = { start: new Date("2026-06-01"), end: new Date("2026-07-13") }; // 6 weeks
    const actual = { start: new Date("2026-06-01"), end: new Date("2026-07-27") }; // 8 weeks

    const result = computeDurationVariance(planned, actual);
    expect(result.varianceWeeks).toBe(2);
    expect(result.hasVariance).toBe(true);
  });

  it("reports a negative variance when the internship ran shorter", () => {
    const planned = { start: new Date("2026-06-01"), end: new Date("2026-07-13") }; // 6 weeks
    const actual = { start: new Date("2026-06-01"), end: new Date("2026-06-29") }; // 4 weeks

    const result = computeDurationVariance(planned, actual);
    expect(result.varianceWeeks).toBe(-2);
    expect(result.hasVariance).toBe(true);
  });
});
