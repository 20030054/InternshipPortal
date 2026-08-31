import type { CaseState } from "@prisma/client";

/**
 * MASTER_PROMPT.md §1.1's eight-step table, as a pure function of
 * `CaseState` — "the eight-step progress line is the student's entire
 * home page... the same graphic as the departmental poster, rendered
 * live" (§10). No I/O: the caller (a Server Component) already has the
 * case's current state; this just decides how to draw it.
 *
 * The three exception paths (§1.2) — restart, waiver, withdrawal — are
 * not numbered steps. A case in one of those states renders as a
 * distinct banner, not a position on the eight-step line, since none of
 * them are "the normal path."
 */

export const EIGHT_STEPS = [
  { step: 1, label: "Check eligibility", actor: "System" },
  { step: 2, label: "Secure internship", actor: "Student" },
  { step: 3, label: "Submit offer letter", actor: "Student" },
  { step: 4, label: "Receive approval", actor: "Focal Person" },
  { step: 5, label: "Conduct internship", actor: "Student" },
  { step: 6, label: "Submit documents", actor: "Student and supervisor" },
  { step: 7, label: "Verify and evaluate", actor: "Focal Person, then HoD" },
  { step: 8, label: "Grade awarded", actor: "HoD" },
] as const;

export type StepStatus = "done" | "current" | "upcoming";

export type NormalProgress = {
  type: "normal";
  currentStep: number;
  steps: { step: number; label: string; actor: string; status: StepStatus }[];
  /** True once the case has left the normal path's live area (a closed
   * outcome) — the line still renders, but nothing is "current" anymore. */
  terminal: boolean;
  outcome: "pass" | "incomplete" | null;
};

export type ExceptionProgress = {
  type: "exception";
  kind: "restart" | "waiver" | "withdrawn";
  state: CaseState;
  label: string;
  terminal: boolean;
};

export type ProgressLineResult = NormalProgress | ExceptionProgress;

/** §1.1's table, column 4 ("System state on entry"), inverted to a
 * state -> step lookup. `OFFER_REJECTED` isn't its own row — BR-08/09's
 * rejection loops back to step 3 (the student revises and resubmits),
 * still the normal path, not an exception. */
const STATE_TO_STEP: Partial<Record<CaseState, number>> = {
  ELIGIBILITY_PENDING: 1,
  ELIGIBLE: 2,
  OFFER_SUBMITTED: 3,
  OFFER_UNDER_REVIEW: 4,
  OFFER_REJECTED: 3,
  APPROVED: 4,
  IN_PROGRESS: 5,
  DOCS_PENDING: 6,
  PENDING_VERIFICATION: 7,
  VERIFIED: 7,
  GRADE_RECOMMENDED: 7,
  CLOSED_PASS: 8,
  CLOSED_INCOMPLETE: 8,
};

const EXCEPTION_STATES: Partial<
  Record<CaseState, { kind: ExceptionProgress["kind"]; label: string; terminal: boolean }>
> = {
  RESTART_REQUESTED: { kind: "restart", label: "Restart requested — awaiting HoD countersignature", terminal: false },
  RESTART_AUTHORIZED: { kind: "restart", label: "Restart authorized — a new case has been opened", terminal: true },
  RESTART_DENIED: { kind: "restart", label: "Restart denied", terminal: true },
  WAIVER_REQUESTED: { kind: "waiver", label: "Waiver requested — awaiting HoD countersignature", terminal: false },
  WAIVER_COUNTERSIGNED: { kind: "waiver", label: "Waiver countersigned — awaiting Dean approval", terminal: false },
  WAIVER_GRANTED: { kind: "waiver", label: "Waiver granted", terminal: true },
  WAIVER_DENIED: { kind: "waiver", label: "Waiver denied", terminal: true },
  WITHDRAWN: { kind: "withdrawn", label: "Withdrawn by the student", terminal: true },
};

export function computeProgressLine(state: CaseState): ProgressLineResult {
  const exception = EXCEPTION_STATES[state];
  if (exception) {
    return { type: "exception", kind: exception.kind, state, label: exception.label, terminal: exception.terminal };
  }

  const currentStep = STATE_TO_STEP[state];
  if (currentStep === undefined) {
    // Exhaustive by construction (every CaseState is in one of the two
    // maps above) — this branch exists only so a future CaseState value
    // added without updating this file fails loudly instead of
    // rendering a blank line.
    throw new Error(`computeProgressLine: unmapped CaseState "${state}"`);
  }

  const terminal = state === "CLOSED_PASS" || state === "CLOSED_INCOMPLETE";
  const outcome = state === "CLOSED_PASS" ? "pass" : state === "CLOSED_INCOMPLETE" ? "incomplete" : null;

  const steps = EIGHT_STEPS.map(({ step, label, actor }) => ({
    step,
    label,
    actor,
    status: (terminal
      ? "done"
      : step < currentStep
        ? "done"
        : step === currentStep
          ? "current"
          : "upcoming") as StepStatus,
  }));

  return { type: "normal", currentStep, steps, terminal, outcome };
}
