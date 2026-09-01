import type { CaseState, Department } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { mapWithConcurrency, sendNotification } from "@/server/notifications/service";
import { DEADLINE_MISSED_TEMPLATE } from "@/server/notifications/templates";

/**
 * BR-05: "Each semester (including summer) has a configured document
 * submission deadline. Cases missing deliverables at that deadline are
 * flagged, not auto-failed." A real gap found auditing for M14's
 * acceptance criterion — `semesters.document_deadline` has existed
 * since M01 with a doc comment naming M07/M09 as the module that would
 * build this sweep; neither did. See docs/modules/M14.md.
 *
 * "Flagged, not auto-failed" is enforced by construction: nothing in
 * this file calls `executeTransition()`. A case is "missing
 * deliverables" if it hasn't yet reached `PENDING_VERIFICATION` (all
 * three of BR-10's deliverables gathered) — the same boundary M12's
 * `runFocalSlaSweep()` and M13's dashboard already treat as "still in
 * progress."
 */

/** Every state before BR-10's checklist gate closes — a case sitting in
 * any of these still has at least one deliverable outstanding. */
const PRE_VERIFICATION_STATES: readonly CaseState[] = [
  "ELIGIBILITY_PENDING",
  "ELIGIBLE",
  "OFFER_SUBMITTED",
  "OFFER_UNDER_REVIEW",
  "OFFER_REJECTED",
  "APPROVED",
  "IN_PROGRESS",
  "DOCS_PENDING",
];

export function isPastDocumentDeadline(deadline: Date | null, now: Date): boolean {
  if (!deadline) return false; // OQ-01: no deadline configured yet, never flagged
  return now.getTime() >= deadline.getTime();
}

export type DeadlineMissedRow = {
  caseId: string;
  studentName: string;
  semesterId: string;
};

/**
 * The semester whose deadline currently governs every active case is
 * the one currently `OPEN` — M03's own exclusivity rule (a partial
 * unique index) guarantees at most one. No open semester, or an open
 * semester with no deadline configured (OQ-01), means nothing can ever
 * be flagged — never a guess at a deadline nobody set.
 */
/** `departments`, when given, restricts this to only those departments'
 * cases — used by `hod-view.ts`'s per-viewer dashboard read, never by
 * `runDeadlineSweep()` below, which stays system-wide unfiltered (a
 * background sweep isn't scoped to any one viewer's assignments). */
export async function findDeadlineMissedCases(
  now: Date = new Date(),
  departments?: readonly Department[],
): Promise<DeadlineMissedRow[]> {
  const openSemester = await prisma.semester.findFirst({
    where: { status: "OPEN" },
    select: { id: true, documentDeadline: true },
  });
  if (!openSemester || !isPastDocumentDeadline(openSemester.documentDeadline, now)) {
    return [];
  }

  const cases = await prisma.case.findMany({
    where: {
      state: { in: [...PRE_VERIFICATION_STATES] },
      ...(departments ? { student: { department: { in: [...departments] } } } : {}),
    },
    select: {
      id: true,
      student: { select: { user: { select: { email: true, fullName: true } } } },
    },
  });

  return cases.map((kase) => ({
    caseId: kase.id,
    studentName: kase.student.user.fullName ?? kase.student.user.email,
    semesterId: openSemester.id,
  }));
}

export type DeadlineSweepResult = { flagged: number; caseIds: string[] };

/**
 * The BullMQ-scheduled half — sends one notification per newly-missed
 * case (deduplicated the same way BR-27's `runFocalSlaSweep()` dedupes
 * its own escalations: has a notification already gone out for this
 * case since the deadline in question, not "ever for this case," since
 * a case can miss more than one semester's deadline over its lifetime
 * in principle). Never touches `cases.state`.
 */
/**
 * Each case's dedup-check-then-notify is independent of every other
 * case's (distinct `caseId` on both the lookup and the write), so this
 * runs with bounded concurrency (`mapWithConcurrency`, M14) rather
 * than one case at a time — a plain sequential loop here scales badly
 * with the product of (missed cases) x (recipients per case), not just
 * either count on its own; see `mapWithConcurrency()`'s own doc
 * comment in `@/server/notifications/service` for why the concurrency
 * is bounded rather than fully unbounded.
 */
export async function runDeadlineSweep(now: Date = new Date()): Promise<DeadlineSweepResult> {
  const missed = await findDeadlineMissedCases(now);

  const results = await mapWithConcurrency(missed, 5, async (row): Promise<string | null> => {
    const alreadyFlagged = await prisma.notification.findFirst({
      where: { caseId: row.caseId, templateId: DEADLINE_MISSED_TEMPLATE.id },
    });
    if (alreadyFlagged) return null;

    await sendNotification(DEADLINE_MISSED_TEMPLATE, row.caseId, {
      caseId: row.caseId,
      fromState: "",
      toState: "",
      reason: null,
    });
    return row.caseId;
  });

  const flaggedCaseIds = results.filter((id): id is string => id !== null);
  return { flagged: flaggedCaseIds.length, caseIds: flaggedCaseIds };
}
