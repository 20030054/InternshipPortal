import type { CaseState, Department } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { workingDaysElapsed } from "@/server/sla/focal-sla";
import { listHolidayDateStrings } from "@/server/roster/holidays";

function focalSlaDays(): number {
  return Number(process.env.SLA_DAYS ?? 10);
}

/** BR-27's own two Focal-pending states — reused, not redefined, from
 * `src/server/sla/service.ts`'s own list (the sweep and this queue must
 * always agree on what counts). */
const FOCAL_PENDING_STATES: readonly CaseState[] = ["OFFER_UNDER_REVIEW", "PENDING_VERIFICATION"];

export type FocalQueueRow = {
  caseId: string;
  studentName: string;
  studentEmail: string;
  companyName: string | null;
  state: CaseState;
  enteredStateAt: Date;
  workingDaysWaiting: number;
  slaDays: number;
  breached: boolean;
};

/**
 * §10: "The Focal Person's queue is sorted by SLA risk, not by date.
 * The thing about to breach is at the top." Most working-days-waiting
 * first; a case already past `SLA_DAYS` sorts above one that isn't,
 * regardless of raw age, since `workingDaysWaiting` already accounts
 * for weekends the same way BR-27's own escalation sweep does.
 */
/** `departments`, when given, restricts the queue to only those
 * departments' cases — see `src/server/authz/department-scope.ts`'s
 * `allowedDepartmentsFor()`; omitted means unfiltered. */
export async function getFocalWorkQueue(
  now: Date = new Date(),
  departments?: readonly Department[],
): Promise<FocalQueueRow[]> {
  const slaDays = focalSlaDays();
  const holidays = await listHolidayDateStrings();
  const cases = await prisma.case.findMany({
    where: {
      state: { in: [...FOCAL_PENDING_STATES] },
      ...(departments ? { student: { department: { in: [...departments] } } } : {}),
    },
    select: {
      id: true,
      state: true,
      student: { select: { user: { select: { email: true, fullName: true } } } },
      company: { select: { name: true } },
    },
  });

  const rows: FocalQueueRow[] = [];
  for (const kase of cases) {
    const entryEvent = await prisma.caseEvent.findFirst({
      where: { caseId: kase.id, toState: kase.state },
      orderBy: { createdAt: "desc" },
    });
    const enteredStateAt = entryEvent?.createdAt ?? now;
    const workingDaysWaiting = workingDaysElapsed(enteredStateAt, now, holidays);
    rows.push({
      caseId: kase.id,
      studentName: kase.student.user.fullName ?? kase.student.user.email,
      studentEmail: kase.student.user.email,
      companyName: kase.company?.name ?? null,
      state: kase.state,
      enteredStateAt,
      workingDaysWaiting,
      slaDays,
      breached: workingDaysWaiting >= slaDays,
    });
  }

  return rows.sort((a, b) => b.workingDaysWaiting - a.workingDaysWaiting);
}
