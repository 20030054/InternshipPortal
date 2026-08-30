import type { GuardFn, GuardResult } from "./types";

/**
 * Real guards — implemented now because the data they need already
 * exists (M01's Grade/Company/RestartRequest tables, M03's eligibility
 * machinery, M05's offer fields). See docs/modules/M04.md and
 * docs/modules/M05.md "Scope decisions" for which guards are real here
 * versus stubbed for a later module to replace.
 */

/** BR-12: the same account may never both recommend and award a grade.
 * Defence in depth alongside M01's grades_recommender_not_awarder CHECK
 * constraint — this is the guard that actually stops the transition
 * before any row is written. */
export const recommenderNotAwarder: GuardFn = (ctx): GuardResult => {
  if (!ctx.grade) {
    return { ok: false, reason: "grade context missing" };
  }
  if (ctx.grade.recommendedBy === ctx.grade.awardedBy) {
    return {
      ok: false,
      reason:
        "BR-12: the same account cannot both recommend and award a grade",
    };
  }
  return { ok: true };
};

/** §5.3 G1: the new organisation must not match the failed case's
 * organisation. Exact normalised-name comparison only — the fuzzy
 * matching above COMPANY_MATCH_THRESHOLD with human confirmation on a
 * flagged match is M10's job (docs/modules/M04.md's division of labour). */
export const differentOrganization: GuardFn = (ctx): GuardResult => {
  if (!ctx.restart) {
    return { ok: false, reason: "restart context missing" };
  }
  const { failedCaseCompanyNormalizedName, newCompanyNormalizedName } =
    ctx.restart;
  if (
    failedCaseCompanyNormalizedName !== null &&
    failedCaseCompanyNormalizedName === newCompanyNormalizedName
  ) {
    return {
      ok: false,
      reason: "G1: the new organisation matches the failed case's organisation",
    };
  }
  return { ok: true };
};

/** §5.3 G2: at least one full semester must remain before the
 * graduation boundary. */
export const timeRemains: GuardFn = (ctx): GuardResult => {
  if (!ctx.restart) {
    return { ok: false, reason: "restart context missing" };
  }
  if (ctx.restart.semestersRemaining < 1) {
    return {
      ok: false,
      reason: "G2: no full semester remains before the graduation boundary",
    };
  }
  return { ok: true };
};

/** §5.3 G4 / BR-19: the student's restart count must be below the
 * configured cap. */
export const belowRestartCap: GuardFn = (ctx): GuardResult => {
  if (!ctx.restart) {
    return { ok: false, reason: "restart context missing" };
  }
  if (ctx.restart.existingRestartCount >= ctx.restart.restartCap) {
    return { ok: false, reason: "G4: restart cap reached" };
  }
  return { ok: true };
};

/** §5.3 G5: the Focal and HoD signatures must come from two distinct
 * accounts — "two signatures from one account is not a valid pair." */
export const distinctSigners: GuardFn = (ctx): GuardResult => {
  if (!ctx.restart?.focalSignerId || !ctx.restart?.hodSignerId) {
    return { ok: false, reason: "signer context missing" };
  }
  if (ctx.restart.focalSignerId === ctx.restart.hodSignerId) {
    return {
      ok: false,
      reason:
        "G5: the Focal and HoD signatures must come from distinct accounts",
    };
  }
  return { ok: true };
};

/** BR-01: eligibility is computed from the roster (M03's
 * `computeEligibility()`), never self-declared — this guard only checks
 * the boolean the caller already computed that way, since a guard itself
 * has no I/O to recompute it from raw semester rows. */
export const eligibilityConfirmed: GuardFn = (ctx): GuardResult => {
  if (!ctx.eligibility) {
    return { ok: false, reason: "eligibility context missing" };
  }
  if (!ctx.eligibility.isEligible) {
    return {
      ok: false,
      reason: "BR-01: student has not completed the 4th semester",
    };
  }
  return { ok: true };
};

/** BR-07: an offer submission (first or resubmission) is invalid without
 * the offer letter file, the company name, the company contact, and a
 * work description of at least 200 characters. Re-checks everything the
 * API layer's zod schema already validated — defence in depth, same
 * pattern as BR-12's guard sitting alongside a DB CHECK. */
export const offerComplete: GuardFn = (ctx): GuardResult => {
  if (!ctx.offer) {
    return { ok: false, reason: "offer context missing" };
  }
  const { companyName, companyContact, workDescription, offerLetterDocumentId } =
    ctx.offer;
  const missing: string[] = [];
  if (!offerLetterDocumentId) missing.push("offer letter file");
  if (!companyName?.trim()) missing.push("company name");
  if (!companyContact?.trim()) missing.push("company contact");
  if (!workDescription || workDescription.length < 200) {
    missing.push("work description (>= 200 characters)");
  }
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `BR-07: offer submission missing ${missing.join(", ")}`,
    };
  }
  return { ok: true };
};

/** BR-08: internship duration must be between MIN_INTERNSHIP_WEEKS and
 * MAX_INTERNSHIP_WEEKS (config, default 4-8). Recomputes the week count
 * itself from the raw planned dates rather than trusting a pre-computed
 * boolean, matching timeRemains/belowRestartCap's style below. */
export const durationWithinBounds: GuardFn = (ctx): GuardResult => {
  const offer = ctx.offer;
  if (
    !offer?.plannedStart ||
    !offer?.plannedEnd ||
    offer.minWeeks === undefined ||
    offer.maxWeeks === undefined
  ) {
    return { ok: false, reason: "planned dates or duration bounds missing" };
  }
  const millisPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeks =
    (offer.plannedEnd.getTime() - offer.plannedStart.getTime()) / millisPerWeek;
  if (weeks <= 0) {
    return { ok: false, reason: "BR-08: planned end must be after planned start" };
  }
  if (weeks < offer.minWeeks) {
    return {
      ok: false,
      reason: `BR-08: duration (${weeks.toFixed(1)} weeks) is below the ${offer.minWeeks}-week minimum`,
    };
  }
  if (weeks > offer.maxWeeks) {
    return {
      ok: false,
      reason: `BR-08: duration (${weeks.toFixed(1)} weeks) exceeds the ${offer.maxWeeks}-week maximum`,
    };
  }
  return { ok: true };
};

/** BR-09: relevance to the degree programme is a mandatory human
 * judgement recorded at approval — the Focal Person must explicitly set
 * this `true`; omitted or `false` blocks approval. See
 * docs/modules/M05.md for why this doesn't also need a second free-text
 * reason field. */
export const relevanceConfirmed: GuardFn = (ctx): GuardResult => {
  if (ctx.offer?.relevanceConfirmed !== true) {
    return {
      ok: false,
      reason: "BR-09: relevance to the degree programme must be explicitly confirmed",
    };
  }
  return { ok: true };
};

/**
 * Always passes. Stands in for BR-10/11 guards (M05 replaced BR-07/08/09
 * with the real guards above), whose underlying fields don't exist yet
 * (M06's document vault, M09's verification records). M09 replaces this
 * stub with a real guard function per transition; the table and executor
 * never change shape when it does.
 *
 * `ruleId` is attached to the returned function so a future audit of
 * `transitions.ts` (or a test asserting "no stub guards remain") can
 * introspect which business rule a given guard slot is still standing in
 * for, rather than that information living only in a call-site comment.
 */
export function stubGuard(ruleId: string): GuardFn {
  const guard: GuardFn = (): GuardResult => ({ ok: true });
  guard.ruleId = ruleId;
  return guard;
}
