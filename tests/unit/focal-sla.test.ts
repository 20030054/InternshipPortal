import { describe, expect, it } from "vitest";
import { workingDaysElapsed, isFocalSlaBreached } from "@/server/sla/focal-sla";

function date(iso: string): Date {
  return new Date(iso);
}

describe("workingDaysElapsed (BR-27)", () => {
  it("is 0 for the same instant", () => {
    expect(workingDaysElapsed(date("2026-03-02T09:00:00Z"), date("2026-03-02T09:00:00Z"))).toBe(0);
  });

  it("is 0 (clamped) when to is before from", () => {
    expect(workingDaysElapsed(date("2026-03-05T00:00:00Z"), date("2026-03-02T00:00:00Z"))).toBe(0);
  });

  it("counts straight through a run of weekdays with no weekend", () => {
    // Monday 2026-03-02 -> Wednesday 2026-03-04, no weekend in between.
    expect(workingDaysElapsed(date("2026-03-02T00:00:00Z"), date("2026-03-04T00:00:00Z"))).toBe(2);
  });

  it("excludes a weekend crossed in the middle", () => {
    // Friday 2026-03-06 -> Monday 2026-03-09: 3 calendar days, 1 weekend day (Sat) fully inside,
    // Sunday is the boundary day not yet reached at the "to" instant's date-only cursor logic --
    // verify against the actual weekday count directly instead of hand-deriving it.
    const from = date("2026-03-06T00:00:00Z"); // Friday
    const to = date("2026-03-09T00:00:00Z"); // Monday
    const elapsed = workingDaysElapsed(from, to);
    expect(elapsed).toBe(1); // Fri->Sat->Sun->Mon: 3 calendar days minus Sat+Sun
  });

  it("scales with fractional days, not just whole ones", () => {
    // Monday 09:00 -> Monday 21:00, same day, half a day elapsed (0.5).
    const elapsed = workingDaysElapsed(date("2026-03-02T09:00:00Z"), date("2026-03-02T21:00:00Z"));
    expect(elapsed).toBeCloseTo(0.5, 5);
  });
});

describe("workingDaysElapsed with a holiday set (OQ-14, D-121)", () => {
  it("a holiday on a weekday is excluded on top of weekends", () => {
    // Monday 2026-03-02 -> Thursday 2026-03-05: 3 weekdays, no weekend.
    // Wednesday 2026-03-04 configured as a holiday -> 2 working days, not 3.
    const elapsed = workingDaysElapsed(
      date("2026-03-02T00:00:00Z"),
      date("2026-03-05T00:00:00Z"),
      new Set(["2026-03-04"]),
    );
    expect(elapsed).toBe(2);
  });

  it("a holiday that falls on a weekend double-counts as nothing extra", () => {
    // Same Friday -> Monday span as the plain weekend test above; Saturday
    // is already excluded as a weekend, so also listing it as a holiday
    // must not subtract twice.
    const elapsed = workingDaysElapsed(
      date("2026-03-06T00:00:00Z"),
      date("2026-03-09T00:00:00Z"),
      new Set(["2026-03-07"]), // the Saturday in between
    );
    expect(elapsed).toBe(1); // unchanged from the no-holiday case
  });

  it("an empty holiday set (the default) reproduces the pre-OQ-14 behaviour exactly", () => {
    const from = date("2026-03-02T00:00:00Z");
    const to = date("2026-03-09T00:00:00Z");
    expect(workingDaysElapsed(from, to, new Set())).toBe(workingDaysElapsed(from, to));
  });
});

describe("isFocalSlaBreached (BR-27)", () => {
  it("is false just under the threshold", () => {
    const enteredAt = date("2026-03-02T00:00:00Z"); // Monday
    const now = date("2026-03-13T23:00:00Z"); // just under 10 working days later
    expect(isFocalSlaBreached(enteredAt, now, 10)).toBe(false);
  });

  it("is true once at or past the threshold", () => {
    const enteredAt = date("2026-03-02T00:00:00Z"); // Monday
    const now = date("2026-03-16T00:00:00Z"); // two full weeks later -> 10 working days
    expect(isFocalSlaBreached(enteredAt, now, 10)).toBe(true);
  });

  it("a holiday inside the window gives Focal more slack, not less — a case breached without it may not be with it", () => {
    const enteredAt = date("2026-03-02T00:00:00Z"); // Monday
    const now = date("2026-03-16T00:00:00Z"); // two full weeks later -> 10 working days, breached
    expect(isFocalSlaBreached(enteredAt, now, 10)).toBe(true);
    // One weekday inside the window now excluded as a holiday too ->
    // only 9 working days elapsed, no longer breached.
    expect(isFocalSlaBreached(enteredAt, now, 10, new Set(["2026-03-04"]))).toBe(false);
  });
});
