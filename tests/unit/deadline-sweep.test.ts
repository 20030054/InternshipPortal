import { describe, expect, it } from "vitest";
import { isPastDocumentDeadline } from "@/server/roster/deadline-sweep";

/**
 * BR-05's pure boundary function. `findDeadlineMissedCases`/
 * `runDeadlineSweep` themselves touch the database and are covered as
 * integration tests (`tests/integration/BR05_deadline_missed.test.ts`),
 * matching this suite's established pure-vs-impure test-type split
 * (see `tests/unit/focal-sla.test.ts` for the same pattern on BR-27).
 */
describe("isPastDocumentDeadline (BR-05)", () => {
  it("is false when no deadline is configured (OQ-01 default — never guess a date)", () => {
    expect(isPastDocumentDeadline(null, new Date("2099-01-01"))).toBe(false);
  });

  it("is false strictly before the deadline", () => {
    const deadline = new Date("2026-06-01T00:00:00Z");
    const before = new Date("2026-05-31T23:59:59Z");
    expect(isPastDocumentDeadline(deadline, before)).toBe(false);
  });

  it("is true exactly at the deadline instant (>=, not >)", () => {
    const deadline = new Date("2026-06-01T00:00:00Z");
    expect(isPastDocumentDeadline(deadline, deadline)).toBe(true);
  });

  it("is true well after the deadline", () => {
    const deadline = new Date("2026-06-01T00:00:00Z");
    const after = new Date("2026-06-02T00:00:00Z");
    expect(isPastDocumentDeadline(deadline, after)).toBe(true);
  });
});
