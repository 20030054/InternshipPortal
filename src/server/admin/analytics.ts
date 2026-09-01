import type { CaseState } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { getHodDashboard, type HodDashboard } from "@/server/dashboards/hod-view";
import { workingDaysElapsed } from "@/server/sla/focal-sla";
import { listHolidayDateStrings } from "@/server/roster/holidays";

/** BR-27's own two Focal-pending states — same list `sla/service.ts`/
 * `focal-queue.ts` each already carry their own copy of. */
const FOCAL_PENDING_STATES: readonly CaseState[] = ["OFFER_UNDER_REVIEW", "PENDING_VERIFICATION"];

function focalSlaDays(): number {
  return Number(process.env.SLA_DAYS ?? 10);
}

export type SlaComplianceSummary = { pending: number; breached: number; withinSla: number };

export type RosterSummary = {
  totalStudents: number;
  totalCasesOpened: number;
  currentSemesterType: string | null;
  currentSemesterYear: number | null;
};

export type AdminAnalytics = {
  countsByState: HodDashboard["countsByState"];
  slaCompliance: SlaComplianceSummary;
  roster: RosterSummary;
};

/**
 * "Complete reporting and analytics... view live current progress
 * through visuals" — computed fresh on every call (same "never a
 * stored snapshot" precedent every other computed fact in this
 * codebase already follows, e.g. `computeEligibility()`,
 * `isGraduationEligible()`). Reuses `getHodDashboard()`'s
 * `countsByState` directly rather than re-querying — the same real,
 * tested aggregation, gated here by `users.manage` instead of
 * `dashboard.view_hod` (the *route* is what enforces which capability
 * is required; this function itself has no gate of its own, matching
 * every other dashboard-view service function).
 */
export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const [hodDashboard, slaCompliance, roster] = await Promise.all([
    getHodDashboard(),
    getSlaComplianceSummary(),
    getRosterSummary(),
  ]);

  return {
    countsByState: hodDashboard.countsByState,
    slaCompliance,
    roster,
  };
}

async function getSlaComplianceSummary(): Promise<SlaComplianceSummary> {
  const slaDays = focalSlaDays();
  const holidays = await listHolidayDateStrings();
  const now = new Date();

  const pendingCases = await prisma.case.findMany({
    where: { state: { in: [...FOCAL_PENDING_STATES] } },
    select: { id: true, state: true },
  });

  let breached = 0;
  for (const kase of pendingCases) {
    const entryEvent = await prisma.caseEvent.findFirst({
      where: { caseId: kase.id, toState: kase.state },
      orderBy: { createdAt: "desc" },
    });
    const enteredAt = entryEvent?.createdAt ?? now;
    if (workingDaysElapsed(enteredAt, now, holidays) >= slaDays) breached++;
  }

  return { pending: pendingCases.length, breached, withinSla: pendingCases.length - breached };
}

async function getRosterSummary(): Promise<RosterSummary> {
  const [totalStudents, totalCasesOpened, currentSemester] = await Promise.all([
    prisma.student.count(),
    prisma.case.count(),
    prisma.semester.findFirst({ where: { status: "OPEN" } }),
  ]);

  return {
    totalStudents,
    totalCasesOpened,
    currentSemesterType: currentSemester?.type ?? null,
    currentSemesterYear: currentSemester?.year ?? null,
  };
}
