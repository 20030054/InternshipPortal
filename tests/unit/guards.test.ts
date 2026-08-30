import { describe, expect, it } from "vitest";
import {
  belowRestartCap,
  differentOrganization,
  distinctSigners,
  recommenderNotAwarder,
  stubGuard,
  timeRemains,
} from "@/server/state-machine/guards";
import type { TransitionContext } from "@/server/state-machine/types";

function baseCtx(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    caseId: "case-1",
    actor: { type: "user", userId: "u1", roles: ["FOCAL"] },
    ...overrides,
  };
}

describe("recommenderNotAwarder (BR-12)", () => {
  it("fails when grade context is missing", () => {
    expect(recommenderNotAwarder(baseCtx()).ok).toBe(false);
  });

  it("rejects when the same account recommended and awarded", () => {
    const result = recommenderNotAwarder(
      baseCtx({ grade: { recommendedBy: "u1", awardedBy: "u1" } }),
    );
    expect(result).toEqual({
      ok: false,
      reason: "BR-12: the same account cannot both recommend and award a grade",
    });
  });

  it("passes when recommender and awarder are distinct", () => {
    const result = recommenderNotAwarder(
      baseCtx({ grade: { recommendedBy: "u1", awardedBy: "u2" } }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("differentOrganization (G1)", () => {
  it("fails when restart context is missing", () => {
    expect(differentOrganization(baseCtx()).ok).toBe(false);
  });

  it("rejects when the new company matches the failed case's company", () => {
    const result = differentOrganization(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: "acme corp",
          newCompanyNormalizedName: "acme corp",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes when the companies differ", () => {
    const result = differentOrganization(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: "acme corp",
          newCompanyNormalizedName: "globex inc",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("passes when the failed case had no recorded company at all", () => {
    const result = differentOrganization(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: null,
          newCompanyNormalizedName: "globex inc",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("timeRemains (G2)", () => {
  it("rejects zero semesters remaining", () => {
    const result = timeRemains(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: null,
          newCompanyNormalizedName: "x",
          semestersRemaining: 0,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes with at least one full semester remaining", () => {
    const result = timeRemains(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: null,
          newCompanyNormalizedName: "x",
          semestersRemaining: 1,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("belowRestartCap (G4 / BR-19)", () => {
  it("rejects when the existing count has reached the cap", () => {
    const result = belowRestartCap(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: null,
          newCompanyNormalizedName: "x",
          semestersRemaining: 2,
          existingRestartCount: 1,
          restartCap: 1,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes when the existing count is below the cap", () => {
    const result = belowRestartCap(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: null,
          newCompanyNormalizedName: "x",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("distinctSigners (G5)", () => {
  it("fails when signer context is incomplete", () => {
    expect(distinctSigners(baseCtx()).ok).toBe(false);
  });

  it("rejects when the focal and HoD signer are the same account", () => {
    const result = distinctSigners(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: null,
          newCompanyNormalizedName: "x",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
          focalSignerId: "u1",
          hodSignerId: "u1",
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes when the signers are distinct", () => {
    const result = distinctSigners(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: null,
          newCompanyNormalizedName: "x",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
          focalSignerId: "u1",
          hodSignerId: "u2",
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("stubGuard", () => {
  it("always passes regardless of context", () => {
    expect(stubGuard("BR-07")(baseCtx())).toEqual({ ok: true });
  });

  it("exposes the rule id it stands in for", () => {
    const guard = stubGuard("BR-09");
    expect(guard.ruleId).toBe("BR-09");
  });
});
