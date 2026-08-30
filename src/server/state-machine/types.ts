import type { CaseState, RoleName } from "@prisma/client";

/**
 * MASTER_PROMPT.md §5.2's transition shape, plus the guard/context types
 * it implies. See docs/modules/M04.md for the full design rationale.
 */

export type GuardResult = { ok: true } | { ok: false; reason: string };

/**
 * One flat shape covering every guard's needs, rather than a
 * per-transition discriminated union — simpler to implement and test, at
 * the cost of each guard being responsible for checking its own required
 * sub-object is present. A deliberate simplicity-over-precision
 * trade-off (docs/modules/M04.md), not an oversight.
 *
 * Pure: guards read only from this object, synchronously, with no I/O of
 * their own. The executor is responsible for fetching whatever a guard
 * needs and populating it here before calling the guard.
 */
export type TransitionContext = {
  caseId: string;
  actor: TransitionActor;
  reason?: string;

  /** Populated only for transitions whose guards need grade context
   * (BR-12: recommender ≠ awarder). */
  grade?: {
    recommendedBy: string;
    awardedBy: string;
  };

  /** Populated only for the restart-gate transitions (§5.3's G1/G2/G4/G5). */
  restart?: {
    failedCaseCompanyNormalizedName: string | null;
    newCompanyNormalizedName: string;
    /** G1's registration-number half (M10) — null on either side means
     * "not available," which never blocks anything (BR-17: "where
     * available"). */
    failedCaseCompanyRegistrationNumber?: string | null;
    newCompanyRegistrationNumber?: string | null;
    /** Full semesters remaining before the graduation boundary — G2. */
    semestersRemaining: number;
    /** How many restarts this student has already had, before this one. */
    existingRestartCount: number;
    restartCap: number;
    focalSignerId?: string;
    hodSignerId?: string;
  };

  /** Populated only for `ELIGIBILITY_PENDING -> ELIGIBLE` (BR-01). See
   * M03's `computeEligibility()` — the caller runs that (impure: reads
   * the roster) and passes just the resulting boolean in here, keeping
   * this guard itself pure. */
  eligibility?: {
    isEligible: boolean;
  };

  /** Populated only for the offer submission/resubmission and approval
   * transitions (BR-07/08/09 — M05). Guards read only the subset of
   * fields their own rule needs. */
  offer?: {
    companyName?: string;
    companyContact?: string;
    workDescription?: string;
    /** `null`/absent means no offer-letter Document exists yet. */
    offerLetterDocumentId?: string | null;
    plannedStart?: Date;
    plannedEnd?: Date;
    /** MIN_INTERNSHIP_WEEKS / MAX_INTERNSHIP_WEEKS, resolved by the
     * caller from config — see rate-limit.ts/mail/transport.ts for the
     * same "read env at the call site" convention this follows. */
    minWeeks?: number;
    maxWeeks?: number;
    relevanceConfirmed?: boolean;
  };

  /** Populated only for `IN_PROGRESS -> DOCS_PENDING` (BR-08's actual-
   * dates half — M07). Only checked for presence/sanity here; the
   * 4-8-week bound is deliberately not enforced on the *actual* dates
   * the way it is on planned ones — BR-08 says variance gets flagged,
   * not blocked. */
  completion?: {
    actualStart?: Date;
    actualEnd?: Date;
  };

  /** Populated only for rows 9 (`DOCS_PENDING -> PENDING_VERIFICATION`,
   * BR-10) and 10 (`PENDING_VERIFICATION -> VERIFIED`, BR-11) — M09.
   * Each guard reads only the subset of fields its own rule needs, same
   * pattern as `offer`. */
  deliverables?: {
    hasActiveOfferLetter?: boolean;
    hasActiveCompletionCertificate?: boolean;
    hasSubmittedEvaluation?: boolean;
    offerLetterVerified?: boolean;
    completionCertificateVerified?: boolean;
  };
};

/** A human actor (session-backed) or the system (a scheduled job /
 * background process — MASTER_PROMPT.md's `SYSTEM` audit actor, same
 * pattern as `audit_events.system_job`). */
export type TransitionActor =
  | { type: "user"; userId: string; roles: readonly RoleName[] }
  | { type: "system"; job: string };

/** Guards are pure: synchronous, no I/O, no database access — see
 * TransitionContext's doc comment. */
export type GuardFn = ((ctx: TransitionContext) => GuardResult) & {
  /** Set only by guards.ts's stubGuard() — lets a future audit find every
   * business rule still standing in for a real guard. Real guards leave
   * this undefined. */
  ruleId?: string;
};

/**
 * Mirrors `cases_one_nonterminal_per_student`'s `WHERE state NOT IN
 * (...)` exclusion list exactly (see the M04 migration) — this is the
 * one place in application code that needs to know the same list, for
 * `openCase()`'s pre-check (M05). Kept as a literal duplicate rather than
 * reading the constraint from Postgres at runtime: there is no
 * information_schema query that's simpler than just keeping these two
 * lists in sync by hand, and the migration is the actual authority
 * either way. If you change one, change the other.
 */
export const TERMINAL_CASE_STATES: readonly CaseState[] = [
  "CLOSED_PASS",
  "CLOSED_INCOMPLETE",
  "WITHDRAWN",
  "WAIVER_GRANTED",
  "WAIVER_DENIED",
  "RESTART_DENIED",
  "RESTART_AUTHORIZED",
];

export type Transition = {
  from: CaseState;
  to: CaseState;
  /** `"SYSTEM"` for a system-initiated transition, otherwise the single
   * role permitted to perform it. */
  actorRole: RoleName | "SYSTEM";
  guards: readonly GuardFn[];
  requiresReason: boolean;
  /** Written to audit_events.event_type on success. */
  emitsEvent: string;
};
