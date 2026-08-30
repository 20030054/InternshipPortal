/**
 * Pure functions over already-fetched facts — no I/O, same convention as
 * M03's `computeEligibility()` and M07's `progress/summary.ts`. Callers
 * fetch the relevant rows and pass in only what each function needs.
 */

export type DeliverablePresenceFacts = {
  hasActiveOfferLetter: boolean;
  hasActiveCompletionCertificate: boolean;
  hasSubmittedEvaluation: boolean;
};

/** BR-10: "all three deliverables exist." The evaluation's presence is
 * its own leg — no `Verification` row is possible for it structurally
 * (see docs/modules/M09.md "Scope decisions"). */
export function deliverablesPresent(facts: DeliverablePresenceFacts): boolean {
  return (
    facts.hasActiveOfferLetter &&
    facts.hasActiveCompletionCertificate &&
    facts.hasSubmittedEvaluation
  );
}

export type DeliverableVerificationFacts = {
  offerLetterVerified: boolean;
  completionCertificateVerified: boolean;
};

/** BR-11: "all deliverables verified." Only the two Document-backed
 * deliverables need a Verification row — see docs/modules/M09.md. */
export function deliverablesVerified(facts: DeliverableVerificationFacts): boolean {
  return facts.offerLetterVerified && facts.completionCertificateVerified;
}
