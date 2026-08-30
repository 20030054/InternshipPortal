import type { Transition } from "./types";
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
  timeRemains,
} from "./guards";

/**
 * The declarative transition table — MASTER_PROMPT.md §5.2/§5.3. See
 * docs/modules/M04.md for the full table with rationale per row; this
 * file is the executable version of that same table.
 *
 * `ELIGIBILITY_PENDING -> ELIGIBLE` now has a real caller (M05's
 * `openCase()`) — see OQ-11.
 *
 * As of M09, every row's guards are real — no `stubGuard()` remains
 * anywhere in this table.
 *
 * `WAIVER_*` rows (M11) resolve OQ-12: a waiver genesis-inserts its own
 * `Case` directly in `WAIVER_REQUESTED` (same pattern as BR-02's sweep
 * and M10's restart — no row here for that step, only for the two
 * signature edges that follow it). See docs/modules/M11.md "Resolving
 * OQ-12."
 */
export const TRANSITIONS: readonly Transition[] = [
  // ---- Normal path ----
  {
    from: "ELIGIBILITY_PENDING",
    to: "ELIGIBLE",
    actorRole: "SYSTEM",
    guards: [eligibilityConfirmed], // BR-01, real as of M05 (src/server/offers/service.ts openCase())
    requiresReason: false,
    emitsEvent: "ELIGIBILITY_CONFIRMED",
  },
  {
    from: "ELIGIBLE",
    to: "OFFER_SUBMITTED",
    actorRole: "STUDENT",
    guards: [offerComplete], // BR-07, real as of M05
    requiresReason: false,
    emitsEvent: "OFFER_SUBMITTED",
  },
  {
    from: "OFFER_SUBMITTED",
    to: "OFFER_UNDER_REVIEW",
    actorRole: "SYSTEM",
    guards: [],
    requiresReason: false,
    emitsEvent: "OFFER_QUEUED_FOR_REVIEW",
  },
  {
    from: "OFFER_UNDER_REVIEW",
    to: "APPROVED",
    actorRole: "FOCAL",
    guards: [durationWithinBounds, relevanceConfirmed], // BR-08/BR-09, real as of M05
    requiresReason: true,
    emitsEvent: "OFFER_APPROVED",
  },
  {
    from: "OFFER_UNDER_REVIEW",
    to: "OFFER_REJECTED",
    actorRole: "FOCAL",
    guards: [],
    requiresReason: true,
    emitsEvent: "OFFER_REJECTED",
  },
  {
    from: "OFFER_REJECTED",
    to: "OFFER_SUBMITTED",
    actorRole: "STUDENT",
    guards: [offerComplete], // BR-07, real as of M05 (resubmission)
    requiresReason: false,
    emitsEvent: "OFFER_RESUBMITTED",
  },
  {
    from: "APPROVED",
    to: "IN_PROGRESS",
    actorRole: "SYSTEM",
    guards: [],
    requiresReason: false,
    emitsEvent: "INTERNSHIP_STARTED",
  },
  {
    from: "IN_PROGRESS",
    to: "DOCS_PENDING",
    actorRole: "STUDENT",
    guards: [actualDatesRecorded], // BR-08, real as of M07
    requiresReason: false,
    emitsEvent: "DOCS_SUBMISSION_STARTED",
  },
  {
    from: "DOCS_PENDING",
    to: "PENDING_VERIFICATION",
    actorRole: "SYSTEM",
    guards: [deliverablesPresent], // BR-10, real as of M09
    requiresReason: false,
    emitsEvent: "ALL_DOCS_RECEIVED",
  },
  {
    from: "PENDING_VERIFICATION",
    to: "VERIFIED",
    actorRole: "FOCAL",
    guards: [deliverablesVerified], // BR-11, real as of M09
    requiresReason: false,
    emitsEvent: "ALL_DELIVERABLES_VERIFIED",
  },
  {
    from: "VERIFIED",
    to: "GRADE_RECOMMENDED",
    actorRole: "FOCAL",
    guards: [],
    requiresReason: true,
    emitsEvent: "GRADE_RECOMMENDED",
  },
  {
    from: "GRADE_RECOMMENDED",
    to: "CLOSED_PASS",
    actorRole: "HOD",
    guards: [recommenderNotAwarder],
    requiresReason: false,
    emitsEvent: "GRADE_AWARDED_PASS",
  },
  {
    from: "GRADE_RECOMMENDED",
    to: "CLOSED_INCOMPLETE",
    actorRole: "HOD",
    guards: [recommenderNotAwarder],
    requiresReason: true,
    emitsEvent: "GRADE_AWARDED_INCOMPLETE",
  },

  // ---- Withdrawal (only reachable before APPROVED) ----
  {
    from: "ELIGIBILITY_PENDING",
    to: "WITHDRAWN",
    actorRole: "STUDENT",
    guards: [],
    requiresReason: false,
    emitsEvent: "CASE_WITHDRAWN",
  },
  {
    from: "ELIGIBLE",
    to: "WITHDRAWN",
    actorRole: "STUDENT",
    guards: [],
    requiresReason: false,
    emitsEvent: "CASE_WITHDRAWN",
  },
  {
    from: "OFFER_SUBMITTED",
    to: "WITHDRAWN",
    actorRole: "STUDENT",
    guards: [],
    requiresReason: false,
    emitsEvent: "CASE_WITHDRAWN",
  },
  {
    from: "OFFER_UNDER_REVIEW",
    to: "WITHDRAWN",
    actorRole: "STUDENT",
    guards: [],
    requiresReason: false,
    emitsEvent: "CASE_WITHDRAWN",
  },
  {
    from: "OFFER_REJECTED",
    to: "WITHDRAWN",
    actorRole: "STUDENT",
    guards: [],
    requiresReason: false,
    emitsEvent: "CASE_WITHDRAWN",
  },

  // ---- Restart gate (§5.3) ----
  {
    from: "CLOSED_INCOMPLETE",
    to: "RESTART_REQUESTED",
    actorRole: "FOCAL",
    guards: [differentOrganization, timeRemains, belowRestartCap],
    requiresReason: true,
    emitsEvent: "RESTART_REQUESTED",
  },
  {
    from: "RESTART_REQUESTED",
    to: "RESTART_AUTHORIZED",
    actorRole: "HOD",
    guards: [distinctSigners],
    requiresReason: true,
    emitsEvent: "RESTART_AUTHORIZED",
  },
  {
    from: "RESTART_REQUESTED",
    to: "RESTART_DENIED",
    actorRole: "HOD",
    guards: [],
    requiresReason: true,
    emitsEvent: "RESTART_DENIED",
  },

  // ---- Waiver path (BR-21 to BR-24) ----
  // No guards on any of these four: BR-22 (circumstance length, evidence
  // attached) is enforced at genesis-insert time, before any transition
  // exists to guard; BR-23 (one waiver per student, ever) is an
  // unconditional unique constraint, not something a per-transition
  // guard could check anyway. `WAIVER_GRANTED`/`WAIVER_DENIED` only
  // being reachable from `WAIVER_COUNTERSIGNED` (never directly from
  // `WAIVER_REQUESTED`) is what makes all three signatures mandatory.
  {
    from: "WAIVER_REQUESTED",
    to: "WAIVER_COUNTERSIGNED",
    actorRole: "HOD",
    guards: [],
    requiresReason: true,
    emitsEvent: "WAIVER_COUNTERSIGNED",
  },
  {
    from: "WAIVER_REQUESTED",
    to: "WAIVER_DENIED",
    actorRole: "HOD",
    guards: [],
    requiresReason: true,
    emitsEvent: "WAIVER_DENIED",
  },
  {
    from: "WAIVER_COUNTERSIGNED",
    to: "WAIVER_GRANTED",
    actorRole: "DEAN",
    guards: [],
    requiresReason: true,
    emitsEvent: "WAIVER_GRANTED",
  },
  {
    from: "WAIVER_COUNTERSIGNED",
    to: "WAIVER_DENIED",
    actorRole: "DEAN",
    guards: [],
    requiresReason: true,
    emitsEvent: "WAIVER_DENIED",
  },
] as const;
