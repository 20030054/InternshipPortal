import { describe, expect, it } from "vitest";
import { deliverablesPresent, deliverablesVerified } from "@/server/grading/checklist";

describe("deliverablesPresent (BR-10)", () => {
  const complete = {
    hasActiveOfferLetter: true,
    hasActiveCompletionCertificate: true,
    hasSubmittedEvaluation: true,
  };

  it("is true when all three are present", () => {
    expect(deliverablesPresent(complete)).toBe(true);
  });

  it("is false when the offer letter is missing", () => {
    expect(deliverablesPresent({ ...complete, hasActiveOfferLetter: false })).toBe(false);
  });

  it("is false when the completion certificate is missing", () => {
    expect(
      deliverablesPresent({ ...complete, hasActiveCompletionCertificate: false }),
    ).toBe(false);
  });

  it("is false when the supervisor evaluation is missing", () => {
    expect(deliverablesPresent({ ...complete, hasSubmittedEvaluation: false })).toBe(false);
  });

  it("is false when nothing is present", () => {
    expect(
      deliverablesPresent({
        hasActiveOfferLetter: false,
        hasActiveCompletionCertificate: false,
        hasSubmittedEvaluation: false,
      }),
    ).toBe(false);
  });
});

describe("deliverablesVerified (BR-11)", () => {
  it("is true when both document-backed deliverables are verified", () => {
    expect(
      deliverablesVerified({
        offerLetterVerified: true,
        completionCertificateVerified: true,
      }),
    ).toBe(true);
  });

  it("is false when only the offer letter is verified", () => {
    expect(
      deliverablesVerified({
        offerLetterVerified: true,
        completionCertificateVerified: false,
      }),
    ).toBe(false);
  });

  it("is false when only the completion certificate is verified", () => {
    expect(
      deliverablesVerified({
        offerLetterVerified: false,
        completionCertificateVerified: true,
      }),
    ).toBe(false);
  });

  it("is false when neither is verified", () => {
    expect(
      deliverablesVerified({
        offerLetterVerified: false,
        completionCertificateVerified: false,
      }),
    ).toBe(false);
  });
});
