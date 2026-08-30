import type { Transition } from "./types";
import {
  belowRestartCap,
  differentOrganization,
  distinctSigners,
  durationWithinBounds,
  eligibilityConfirmed,
  offerComplete,
  recommenderNotAwarder,
  relevanceConfirmed,
  stubGuard,
  timeRemains,
} from "./guards";

/**
 * The declarative transition table — MASTER_PROMPT.md §5.2/§5.3. See
 * docs/modules/M04.md for the full table with rationale per row; this
 * file is the executable version of that same table.
 *
 * `WAIVER_*` states are deliberately absent as transition targets — see
 * OPEN_QUESTIONS.md OQ-12. `ELIGIBILITY_PENDING -> ELIGIBLE` now has a
 * real caller (M05's `openCase()`) — see OQ-11.
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
    guards: [],
    requiresReason: false,
    emitsEvent: "DOCS_SUBMISSION_STARTED",
  },
  {
    from: "DOCS_PENDING",
    to: "PENDING_VERIFICATION",
    actorRole: "SYSTEM",
    guards: [stubGuard("BR-10")], // TODO(M08/M09): all three deliverables present — M06 wires the offer-letter/completion-certificate legs' Document rows but leaves this stub, since the third (supervisor evaluation, M08) has no data model yet; see docs/modules/M06.md
    requiresReason: false,
    emitsEvent: "ALL_DOCS_RECEIVED",
  },
  {
    from: "PENDING_VERIFICATION",
    to: "VERIFIED",
    actorRole: "FOCAL",
    guards: [stubGuard("BR-11")], // TODO(M09): all three deliverables verified
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
] as const;
