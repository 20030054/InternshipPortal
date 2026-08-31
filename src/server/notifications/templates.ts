import type { RoleName } from "@prisma/client";

/**
 * "Email templates for every status change... All email content is
 * templated and versioned — no ad-hoc strings in services."
 * (MASTER_PROMPT.md §7, M12.) Keyed by the transition table's own
 * `emitsEvent` string (M04) rather than inventing a parallel naming
 * scheme — every one of M04's 25 transition rows already carries a
 * stable identifier for exactly this purpose.
 *
 * `recipients: []` is a deliberate, explicit "no email for this event,"
 * not a gap — see each entry's comment for why. Every one of the 20
 * distinct `emitsEvent` values in the real table has an entry here;
 * `dispatchTransitionNotification()` (service.ts) silently no-ops for
 * anything *not* found here, which should only ever be a synthetic
 * table used by a unit test, never the real one.
 */

export type RecipientRule =
  | { kind: "student" } // the Student on the case this event fired for
  | { kind: "role"; role: RoleName }; // every user currently holding this role

export type TemplateContext = {
  caseId: string;
  fromState: string;
  toState: string;
  reason: string | null;
};

export type RenderedEmail = { subject: string; text: string };

export type NotificationTemplate = {
  id: string;
  version: number;
  recipients: readonly RecipientRule[];
  render: (ctx: TemplateContext) => RenderedEmail;
};

function reasonLine(ctx: TemplateContext): string {
  return ctx.reason ? `\nReason given: ${ctx.reason}\n` : "";
}

const TEMPLATES: Record<string, NotificationTemplate> = {
  ELIGIBILITY_CONFIRMED: {
    id: "eligibility-confirmed",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "You are now eligible to begin your internship",
      text: "You have completed enough semesters to be eligible for the internship course. You may now open a case and submit an offer letter.",
    }),
  },
  OFFER_SUBMITTED: {
    id: "offer-submitted",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "Your offer letter was received",
      text: "Your offer letter and work description have been received and are queued for the Focal Person's review.",
    }),
  },
  // The FOCAL-facing "please review" side of both first submission and
  // resubmission — this event fires immediately after both
  // OFFER_SUBMITTED and OFFER_RESUBMITTED (M05's submitOffer() chains
  // straight into it), so one template covers both paths rather than
  // duplicating the same alert on two different events.
  OFFER_QUEUED_FOR_REVIEW: {
    id: "offer-queued-for-review",
    version: 1,
    recipients: [{ kind: "role", role: "FOCAL" }],
    render: () => ({
      subject: "A new offer submission needs review",
      text: "A student has submitted an offer letter that is now awaiting Focal Person review.",
    }),
  },
  OFFER_APPROVED: {
    id: "offer-approved",
    version: 1,
    recipients: [{ kind: "student" }],
    render: (ctx) => ({
      subject: "Your internship offer was approved",
      text: `Your offer has been approved and your internship is now recorded as in progress.${reasonLine(ctx)}`,
    }),
  },
  OFFER_REJECTED: {
    id: "offer-rejected",
    version: 1,
    recipients: [{ kind: "student" }],
    render: (ctx) => ({
      subject: "Your internship offer was not approved",
      text: `Your offer letter was not approved. You may revise and resubmit it.${reasonLine(ctx)}`,
    }),
  },
  OFFER_RESUBMITTED: {
    id: "offer-resubmitted",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "Your revised offer letter was received",
      text: "Your revised offer letter has been received and is queued for the Focal Person's review.",
    }),
  },
  INTERNSHIP_STARTED: {
    id: "internship-started",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "Your internship has started",
      text: "Your internship is now in progress. Remember to keep your progress log up to date and record your actual start/end dates once you finish.",
    }),
  },
  DOCS_SUBMISSION_STARTED: {
    id: "docs-submission-started",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "Please upload your completion certificate",
      text: "You have recorded your internship's actual dates. Please upload your completion certificate to continue.",
    }),
  },
  ALL_DOCS_RECEIVED: {
    id: "all-docs-received",
    version: 1,
    recipients: [{ kind: "role", role: "FOCAL" }],
    render: () => ({
      subject: "A case is ready for deliverable verification",
      text: "All required deliverables have been submitted for a case and are now awaiting verification.",
    }),
  },
  // The Focal Person who just verified everything is the one who fired
  // this event — no new party needs telling, and the natural next step
  // (recommending a grade) is their own deliberate, separately-timed
  // action, not something an email should nudge immediately.
  ALL_DELIVERABLES_VERIFIED: {
    id: "all-deliverables-verified",
    version: 1,
    recipients: [],
    render: () => ({ subject: "", text: "" }),
  },
  GRADE_RECOMMENDED: {
    id: "grade-recommended",
    version: 1,
    recipients: [{ kind: "role", role: "HOD" }],
    render: () => ({
      subject: "A grade recommendation awaits your decision",
      text: "A Focal Person has recommended a grade for a case. It is now awaiting the HoD's award decision.",
    }),
  },
  GRADE_AWARDED_PASS: {
    id: "grade-awarded-pass",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "Your internship grade has been recorded: Pass",
      text: "The HoD has awarded a Pass for your internship course.",
    }),
  },
  GRADE_AWARDED_INCOMPLETE: {
    id: "grade-awarded-incomplete",
    version: 1,
    recipients: [{ kind: "student" }],
    render: (ctx) => ({
      subject: "Your internship grade has been recorded: Incomplete",
      text: `The HoD has awarded Incomplete for your internship course.${reasonLine(ctx)}`,
    }),
  },
  CASE_WITHDRAWN: {
    id: "case-withdrawn",
    version: 1,
    recipients: [{ kind: "role", role: "FOCAL" }],
    render: () => ({
      subject: "A student withdrew their internship case",
      text: "A student has withdrawn their case from the internship process.",
    }),
  },
  RESTART_REQUESTED: {
    id: "restart-requested",
    version: 1,
    recipients: [{ kind: "role", role: "HOD" }],
    render: () => ({
      subject: "A restart request awaits your countersignature",
      text: "A Focal Person has requested a restart for a student with an Incomplete case. It is now awaiting the HoD's countersignature.",
    }),
  },
  RESTART_AUTHORIZED: {
    id: "restart-authorized",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "Your restart request was authorized",
      text: "Your restart request has been authorized. A new case has been opened for you — you may now submit an offer letter for the new placement.",
    }),
  },
  RESTART_DENIED: {
    id: "restart-denied",
    version: 1,
    recipients: [{ kind: "student" }],
    render: (ctx) => ({
      subject: "Your restart request was denied",
      text: `Your restart request was not authorized.${reasonLine(ctx)}`,
    }),
  },
  WAIVER_COUNTERSIGNED: {
    id: "waiver-countersigned",
    version: 1,
    recipients: [{ kind: "role", role: "DEAN" }],
    render: () => ({
      subject: "A waiver awaits your final approval",
      text: "An HoD has counter-signed a waiver request. It is now awaiting the Dean's final approval.",
    }),
  },
  WAIVER_DENIED: {
    id: "waiver-denied",
    version: 1,
    recipients: [{ kind: "student" }],
    render: (ctx) => ({
      subject: "Your waiver request was denied",
      text: `Your waiver request was not granted.${reasonLine(ctx)}`,
    }),
  },
  WAIVER_GRANTED: {
    id: "waiver-granted",
    version: 1,
    recipients: [{ kind: "student" }],
    render: () => ({
      subject: "Your waiver request was granted",
      text: "Your waiver request has been granted.",
    }),
  },
};

export function templateForEvent(emitsEvent: string): NotificationTemplate | null {
  return TEMPLATES[emitsEvent] ?? null;
}

/** Not part of the transition table's own events — sent directly by
 * `initiateWaiver()` (M11), a genesis insert that never calls
 * `executeTransition()`. See docs/modules/M12.md "Scope decisions." */
export const WAIVER_INITIATED_TEMPLATE: NotificationTemplate = {
  id: "waiver-initiated",
  version: 1,
  recipients: [{ kind: "role", role: "HOD" }],
  render: () => ({
    subject: "A waiver request awaits your countersignature",
    text: "A Focal Person has initiated a waiver request. It is now awaiting the HoD's countersignature.",
  }),
};

// -----------------------------------------------------------------
// BR-27/BR-28: sweep-driven templates, not tied to any single
// transition — src/server/sla/service.ts sends these directly.
// -----------------------------------------------------------------

export const FOCAL_SLA_ESCALATION_TEMPLATE: NotificationTemplate = {
  id: "focal-sla-escalation",
  version: 1,
  recipients: [{ kind: "role", role: "HOD" }],
  render: (ctx) => ({
    subject: "A case has exceeded its SLA and needs attention",
    text: `A case has been sitting in ${ctx.toState} for longer than the configured SLA without Focal Person action (BR-27).`,
  }),
};

export const SUPERVISOR_FIRST_REMINDER_TEMPLATE: NotificationTemplate = {
  id: "supervisor-first-reminder",
  version: 1,
  recipients: [], // sent directly to the supervisor's own email, not resolved by role/case
  render: () => ({
    subject: "Reminder: internship evaluation still pending",
    text: "This is a reminder that we have not yet received your evaluation of the student's internship. Please use the link previously sent to you to complete it.",
  }),
};

export const SUPERVISOR_SECOND_REMINDER_TEMPLATE: NotificationTemplate = {
  id: "supervisor-second-reminder",
  version: 1,
  recipients: [],
  render: () => ({
    subject: "Second reminder: internship evaluation still pending",
    text: "This is a second reminder that we have not yet received your evaluation of the student's internship. Please use the link previously sent to you to complete it at your earliest convenience.",
  }),
};

export const SUPERVISOR_UNRESPONSIVE_TEMPLATE: NotificationTemplate = {
  id: "supervisor-unresponsive",
  version: 1,
  recipients: [{ kind: "role", role: "FOCAL" }],
  render: () => ({
    subject: "Supervisor unresponsive — case needs your intervention",
    text: "A workplace supervisor has not submitted an evaluation despite two reminders (BR-28). This case now needs Focal Person intervention.",
  }),
};
