import { describe, expect, it } from "vitest";
import { companyNameSimilarity, matchCompany } from "@/server/companies/match";

describe("companyNameSimilarity", () => {
  it("is 1 for identical strings", () => {
    expect(companyNameSimilarity("acme corp", "acme corp")).toBe(1);
  });

  it("is 1 for two empty strings", () => {
    expect(companyNameSimilarity("", "")).toBe(1);
  });

  it("is 0 for completely disjoint single characters", () => {
    expect(companyNameSimilarity("a", "z")).toBe(0);
  });

  it("scales with edit distance relative to the longer string", () => {
    // "acme corp" (9) -> "acme corp2" (10): 1 insertion, longer=10.
    expect(companyNameSimilarity("acme corp", "acme corp2")).toBeCloseTo(0.9, 5);
  });

  it("is symmetric", () => {
    expect(companyNameSimilarity("kitten", "sitting")).toBe(
      companyNameSimilarity("sitting", "kitten"),
    );
  });
});

describe("matchCompany (G1, BR-17)", () => {
  const threshold = 0.85;

  it("flags exactNameMatch on identical normalised names", () => {
    const result = matchCompany(
      { normalizedName: "acme corp", registrationNumber: null },
      { normalizedName: "acme corp", registrationNumber: null },
      threshold,
    );
    expect(result.exactNameMatch).toBe(true);
    expect(result.flagged).toBe(false); // exact, not "flagged" -- a hard block, not a soft one
  });

  it("flags exactRegistrationMatch when names differ but registration numbers match", () => {
    const result = matchCompany(
      { normalizedName: "acme corp", registrationNumber: "NTN-1" },
      { normalizedName: "acme holdings", registrationNumber: "NTN-1" },
      threshold,
    );
    expect(result.exactNameMatch).toBe(false);
    expect(result.exactRegistrationMatch).toBe(true);
  });

  it("never claims a registration match when either side lacks one", () => {
    const result = matchCompany(
      { normalizedName: "acme corp", registrationNumber: null },
      { normalizedName: "acme holdings", registrationNumber: "NTN-1" },
      threshold,
    );
    expect(result.exactRegistrationMatch).toBe(false);
  });

  it("flags a near-miss name above the threshold as flagged, not exact", () => {
    const result = matchCompany(
      { normalizedName: "acme corp", registrationNumber: null },
      { normalizedName: "acme corp2", registrationNumber: null },
      threshold,
    );
    expect(result.exactNameMatch).toBe(false);
    expect(result.similarity).toBeGreaterThanOrEqual(threshold);
    expect(result.flagged).toBe(true);
  });

  it("does not flag a genuinely different name below the threshold", () => {
    const result = matchCompany(
      { normalizedName: "acme corp", registrationNumber: null },
      { normalizedName: "globex inc", registrationNumber: null },
      threshold,
    );
    expect(result.flagged).toBe(false);
  });
});
