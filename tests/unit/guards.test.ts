import { describe, expect, it } from "vitest";
import {
  actualDatesRecorded,
  belowRestartCap,
  deliverablesPresent,
  deliverablesVerified,
  differentOrganization,
  distinctSigners,
  durationWithinBounds,
  eligibilityConfirmed,
  offerComplete,
  recommenderNotAwarder,
  relevanceConfirmed,
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

  it("rejects a different name but a matching registration number (M10)", () => {
    const result = differentOrganization(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: "acme corp",
          newCompanyNormalizedName: "acme holdings llc",
          failedCaseCompanyRegistrationNumber: "NTN-123",
          newCompanyRegistrationNumber: "NTN-123",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes on differing registration numbers even with similar names (M10)", () => {
    const result = differentOrganization(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: "acme corp",
          newCompanyNormalizedName: "acme corp 2",
          failedCaseCompanyRegistrationNumber: "NTN-123",
          newCompanyRegistrationNumber: "NTN-456",
          semestersRemaining: 2,
          existingRestartCount: 0,
          restartCap: 1,
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("passes when registration numbers aren't available on either side (M10, 'where available')", () => {
    const result = differentOrganization(
      baseCtx({
        restart: {
          failedCaseCompanyNormalizedName: "acme corp",
          newCompanyNormalizedName: "globex inc",
          failedCaseCompanyRegistrationNumber: null,
          newCompanyRegistrationNumber: null,
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
    expect(stubGuard("BR-10")(baseCtx())).toEqual({ ok: true });
  });

  it("exposes the rule id it stands in for", () => {
    const guard = stubGuard("BR-11");
    expect(guard.ruleId).toBe("BR-11");
  });
});

describe("eligibilityConfirmed (BR-01)", () => {
  it("fails when eligibility context is missing", () => {
    expect(eligibilityConfirmed(baseCtx()).ok).toBe(false);
  });

  it("rejects when computeEligibility() found the student ineligible", () => {
    const result = eligibilityConfirmed(baseCtx({ eligibility: { isEligible: false } }));
    expect(result.ok).toBe(false);
  });

  it("passes when eligible", () => {
    const result = eligibilityConfirmed(baseCtx({ eligibility: { isEligible: true } }));
    expect(result).toEqual({ ok: true });
  });
});

const completeOffer = {
  companyName: "Acme Corp",
  companyContact: "hr@acme.test",
  workDescription: "x".repeat(200),
  offerLetterDocumentId: "doc-1",
};

describe("offerComplete (BR-07)", () => {
  it("fails when offer context is missing", () => {
    expect(offerComplete(baseCtx()).ok).toBe(false);
  });

  it("rejects a missing offer letter document", () => {
    const result = offerComplete(
      baseCtx({ offer: { ...completeOffer, offerLetterDocumentId: null } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("offer letter file");
  });

  it("rejects a blank company name", () => {
    const result = offerComplete(baseCtx({ offer: { ...completeOffer, companyName: "  " } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("company name");
  });

  it("rejects a blank company contact", () => {
    const result = offerComplete(
      baseCtx({ offer: { ...completeOffer, companyContact: "" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("company contact");
  });

  it("rejects a work description under 200 characters", () => {
    const result = offerComplete(
      baseCtx({ offer: { ...completeOffer, workDescription: "x".repeat(199) } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("work description");
  });

  it("passes at exactly 200 characters with every other field present", () => {
    const result = offerComplete(baseCtx({ offer: completeOffer }));
    expect(result).toEqual({ ok: true });
  });

  it("reports every missing field together, not just the first", () => {
    const result = offerComplete(
      baseCtx({
        offer: {
          companyName: "",
          companyContact: "",
          workDescription: "",
          offerLetterDocumentId: null,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("offer letter file");
      expect(result.reason).toContain("company name");
      expect(result.reason).toContain("company contact");
      expect(result.reason).toContain("work description");
    }
  });
});

describe("durationWithinBounds (BR-08)", () => {
  const bounds = { minWeeks: 4, maxWeeks: 8 };

  it("fails when planned dates or bounds are missing", () => {
    expect(durationWithinBounds(baseCtx()).ok).toBe(false);
  });

  it("rejects an end date not after the start date", () => {
    const result = durationWithinBounds(
      baseCtx({
        offer: {
          ...bounds,
          plannedStart: new Date("2026-06-01"),
          plannedEnd: new Date("2026-06-01"),
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a duration under the minimum", () => {
    const result = durationWithinBounds(
      baseCtx({
        offer: {
          ...bounds,
          plannedStart: new Date("2026-06-01"),
          plannedEnd: new Date("2026-06-15"), // 2 weeks
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a duration over the maximum", () => {
    const result = durationWithinBounds(
      baseCtx({
        offer: {
          ...bounds,
          plannedStart: new Date("2026-06-01"),
          plannedEnd: new Date("2026-09-01"), // ~13 weeks
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes a duration within bounds", () => {
    const result = durationWithinBounds(
      baseCtx({
        offer: {
          ...bounds,
          plannedStart: new Date("2026-06-01"),
          plannedEnd: new Date("2026-07-13"), // 6 weeks
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("relevanceConfirmed (BR-09)", () => {
  it("rejects when omitted", () => {
    expect(relevanceConfirmed(baseCtx()).ok).toBe(false);
  });

  it("rejects when explicitly false", () => {
    const result = relevanceConfirmed(baseCtx({ offer: { relevanceConfirmed: false } }));
    expect(result.ok).toBe(false);
  });

  it("passes when explicitly true", () => {
    const result = relevanceConfirmed(baseCtx({ offer: { relevanceConfirmed: true } }));
    expect(result).toEqual({ ok: true });
  });
});

describe("actualDatesRecorded (BR-08, actual-dates half)", () => {
  it("fails when completion context is missing", () => {
    expect(actualDatesRecorded(baseCtx()).ok).toBe(false);
  });

  it("fails when only one of the two dates is present", () => {
    const result = actualDatesRecorded(
      baseCtx({ completion: { actualStart: new Date("2026-06-01") } }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an actual end date not after the actual start date", () => {
    const result = actualDatesRecorded(
      baseCtx({
        completion: {
          actualStart: new Date("2026-06-15"),
          actualEnd: new Date("2026-06-01"),
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes with a sane actual date range, regardless of length", () => {
    // Deliberately outside the 4-8-week planned bound -- this guard
    // never enforces that; BR-08 flags variance, it doesn't block it.
    const result = actualDatesRecorded(
      baseCtx({
        completion: {
          actualStart: new Date("2026-06-01"),
          actualEnd: new Date("2026-06-15"), // 2 weeks
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("deliverablesPresent (BR-10)", () => {
  it("fails when deliverables context is missing", () => {
    expect(deliverablesPresent(baseCtx()).ok).toBe(false);
  });

  it("rejects when any leg is missing", () => {
    const result = deliverablesPresent(
      baseCtx({
        deliverables: {
          hasActiveOfferLetter: true,
          hasActiveCompletionCertificate: false,
          hasSubmittedEvaluation: true,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes when all three legs are present", () => {
    const result = deliverablesPresent(
      baseCtx({
        deliverables: {
          hasActiveOfferLetter: true,
          hasActiveCompletionCertificate: true,
          hasSubmittedEvaluation: true,
        },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("deliverablesVerified (BR-11)", () => {
  it("fails when deliverables context is missing", () => {
    expect(deliverablesVerified(baseCtx()).ok).toBe(false);
  });

  it("rejects when the completion certificate isn't verified yet", () => {
    const result = deliverablesVerified(
      baseCtx({
        deliverables: { offerLetterVerified: true, completionCertificateVerified: false },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes when both document-backed deliverables are verified", () => {
    const result = deliverablesVerified(
      baseCtx({
        deliverables: { offerLetterVerified: true, completionCertificateVerified: true },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
