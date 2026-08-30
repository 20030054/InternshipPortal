import type { GuardFn, GuardResult } from "./types";

/**
 * Real guards — implemented now because the data they need already
 * exists (M01's Grade/Company/RestartRequest tables, M03's eligibility
 * machinery). See docs/modules/M04.md "Scope decisions" for which guards
 * are real here versus stubbed for a later module to replace.
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

/**
 * Always passes. Stands in for BR-07/08/09/10/11 guards, whose
 * underlying fields don't exist on `cases` yet (M01 deferred them to
 * M05/M09 — see docs/modules/M01.md). M05/M09 replace this stub with a
 * real guard function per transition; the table and executor never
 * change shape when they do.
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
