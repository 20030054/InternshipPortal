import { describe, expect, it } from "vitest";
import { countWeeksCompleted, hasReachedMidpoint } from "@/server/progress/summary";

describe("countWeeksCompleted", () => {
  it("counts entries, not the highest week number", () => {
    // Weeks 1 and 3 logged, week 2 skipped -- should count 2, not 3.
    const entries = [{ weekNumber: 1 }, { weekNumber: 3 }];
    expect(countWeeksCompleted(entries)).toBe(2);
  });

  it("returns 0 for no entries", () => {
    expect(countWeeksCompleted([])).toBe(0);
  });
});

describe("hasReachedMidpoint", () => {
  it("is false before any entry reaches the midpoint week", () => {
    // 6-week internship, midpoint is ceil(6/2) = week 3.
    const entries = [{ weekNumber: 1 }, { weekNumber: 2 }];
    expect(hasReachedMidpoint(entries, 6)).toBe(false);
  });

  it("is true once an entry reaches exactly the midpoint week", () => {
    const entries = [{ weekNumber: 1 }, { weekNumber: 3 }];
    expect(hasReachedMidpoint(entries, 6)).toBe(true);
  });

  it("is true once an entry is past the midpoint week", () => {
    const entries = [{ weekNumber: 5 }];
    expect(hasReachedMidpoint(entries, 6)).toBe(true);
  });

  it("rounds an odd planned duration's midpoint up", () => {
    // 5-week internship, midpoint is ceil(5/2) = week 3.
    expect(hasReachedMidpoint([{ weekNumber: 2 }], 5)).toBe(false);
    expect(hasReachedMidpoint([{ weekNumber: 3 }], 5)).toBe(true);
  });

  it("is false for no entries", () => {
    expect(hasReachedMidpoint([], 6)).toBe(false);
  });
});
