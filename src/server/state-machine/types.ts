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
    /** Full semesters remaining before the graduation boundary — G2. */
    semestersRemaining: number;
    /** How many restarts this student has already had, before this one. */
    existingRestartCount: number;
    restartCap: number;
    focalSignerId?: string;
    hodSignerId?: string;
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
