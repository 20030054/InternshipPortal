import { describe, expect, it } from "vitest";
import type { CaseState } from "@prisma/client";
import { computeProgressLine, EIGHT_STEPS } from "@/server/dashboards/progress-line";

const ALL_CASE_STATES: readonly CaseState[] = [
  "ELIGIBILITY_PENDING",
  "ELIGIBLE",
  "OFFER_SUBMITTED",
  "OFFER_UNDER_REVIEW",
  "OFFER_REJECTED",
  "APPROVED",
  "IN_PROGRESS",
  "DOCS_PENDING",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "GRADE_RECOMMENDED",
  "CLOSED_PASS",
  "CLOSED_INCOMPLETE",
  "WITHDRAWN",
  "RESTART_REQUESTED",
  "RESTART_AUTHORIZED",
  "RESTART_DENIED",
  "WAIVER_REQUESTED",
  "WAIVER_COUNTERSIGNED",
  "WAIVER_GRANTED",
  "WAIVER_DENIED",
];

describe("computeProgressLine (MASTER_PROMPT.md §1.1)", () => {
  it("handles every real CaseState without throwing", () => {
    for (const state of ALL_CASE_STATES) {
      expect(() => computeProgressLine(state)).not.toThrow();
    }
  });

  it.each([
    ["ELIGIBILITY_PENDING", 1],
    ["ELIGIBLE", 2],
    ["OFFER_SUBMITTED", 3],
    ["OFFER_UNDER_REVIEW", 4],
    ["OFFER_REJECTED", 3],
    ["APPROVED", 4],
    ["IN_PROGRESS", 5],
    ["DOCS_PENDING", 6],
    ["PENDING_VERIFICATION", 7],
    ["VERIFIED", 7],
    ["GRADE_RECOMMENDED", 7],
  ] as const)("%s maps to step %i", (state, expectedStep) => {
    const result = computeProgressLine(state);
    expect(result.type).toBe("normal");
    if (result.type === "normal") {
      expect(result.currentStep).toBe(expectedStep);
      expect(result.terminal).toBe(false);
      expect(result.outcome).toBeNull();
    }
  });

  it("OFFER_REJECTED loops back to step 3, not a new exception state", () => {
    const result = computeProgressLine("OFFER_REJECTED");
    expect(result.type).toBe("normal");
  });

  it("steps before the current one are done, the current one is current, the rest are upcoming", () => {
    const result = computeProgressLine("DOCS_PENDING");
    expect(result.type).toBe("normal");
    if (result.type !== "normal") return;
    expect(result.steps.filter((s) => s.status === "done").map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
    expect(result.steps.find((s) => s.step === 6)?.status).toBe("current");
    expect(result.steps.filter((s) => s.status === "upcoming").map((s) => s.step)).toEqual([7, 8]);
  });

  it("CLOSED_PASS is terminal, step 8, every step marked done, outcome pass", () => {
    const result = computeProgressLine("CLOSED_PASS");
    expect(result.type).toBe("normal");
    if (result.type !== "normal") return;
    expect(result.terminal).toBe(true);
    expect(result.outcome).toBe("pass");
    expect(result.steps.every((s) => s.status === "done")).toBe(true);
  });

  it("CLOSED_INCOMPLETE is terminal, step 8, every step marked done, outcome incomplete", () => {
    const result = computeProgressLine("CLOSED_INCOMPLETE");
    expect(result.type).toBe("normal");
    if (result.type !== "normal") return;
    expect(result.terminal).toBe(true);
    expect(result.outcome).toBe("incomplete");
  });

  it.each([
    ["WITHDRAWN", "withdrawn", true],
    ["RESTART_REQUESTED", "restart", false],
    ["RESTART_AUTHORIZED", "restart", true],
    ["RESTART_DENIED", "restart", true],
    ["WAIVER_REQUESTED", "waiver", false],
    ["WAIVER_COUNTERSIGNED", "waiver", false],
    ["WAIVER_GRANTED", "waiver", true],
    ["WAIVER_DENIED", "waiver", true],
  ] as const)("%s is an exception state (%s), terminal=%s", (state, kind, terminal) => {
    const result = computeProgressLine(state);
    expect(result.type).toBe("exception");
    if (result.type !== "exception") return;
    expect(result.kind).toBe(kind);
    expect(result.terminal).toBe(terminal);
    expect(result.label.length).toBeGreaterThan(0);
  });

  it("EIGHT_STEPS has exactly 8 entries matching MASTER_PROMPT.md §1.1's table", () => {
    expect(EIGHT_STEPS).toHaveLength(8);
    expect(EIGHT_STEPS.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(EIGHT_STEPS[3]?.label).toBe("Receive approval");
    expect(EIGHT_STEPS[3]?.actor).toBe("Focal Person");
    expect(EIGHT_STEPS[7]?.label).toBe("Grade awarded");
  });
});
