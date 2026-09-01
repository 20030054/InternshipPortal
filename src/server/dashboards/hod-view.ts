import type { CaseState, Department, RestartOutcome, WaiverOutcome } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { computeEligibility, type SemesterFact } from "@/server/roster/eligibility";
import { listWaivers } from "@/server/waivers/service";
import { listAllRestartRequests } from "@/server/restart/service";
import { findDeadlineMissedCases, type DeadlineMissedRow } from "@/server/roster/deadline-sweep";

export type StateCount = { state: CaseState; count: number };

export type OverdueEligibilityRow = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  semestersCompleted: number;
};

export type PendingVerificationRow = {
  caseId: string;
  studentName: string;
  companyName: string | null;
};

export type WaiverRow = {
  waiverId: string;
  studentName: string;
  outcome: WaiverOutcome;
  createdAt: Date;
};

export type RestartRow = {
  requestId: string;
  studentName: string;
  outcome: RestartOutcome;
  createdAt: Date;
};

export type HodDashboard = {
  countsByState: StateCount[];
  /** "At risk of not graduating" — eligible, zero cases, hasn't acted.
   * See docs/modules/M13.md "Scope decisions." */
  overdueEligibility: OverdueEligibilityRow[];
  pendingVerifications: PendingVerificationRow[];
  waivers: WaiverRow[];
  restarts: RestartRow[];
  /** BR-05 (M14) — flagged, never auto-failed. See
   * src/server/roster/deadline-sweep.ts. */
  deadlineMissed: DeadlineMissedRow[];
};

async function studentNameById(studentId: string): Promise<string> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { user: { select: { email: true, fullName: true } } },
  });
  return student ? (student.user.fullName ?? student.user.email) : "(unknown student)";
}

async function studentNameByFailedCaseId(failedCaseId: string): Promise<string> {
  const kase = await prisma.case.findUnique({
    where: { id: failedCaseId },
    select: { student: { select: { user: { select: { email: true, fullName: true } } } } },
  });
  return kase ? (kase.student.user.fullName ?? kase.student.user.email) : "(unknown student)";
}

/** `departments`, when given, restricts every part of this dashboard to
 * only those departments — see `src/server/authz/department-scope.ts`'s
 * `allowedDepartmentsFor()`; omitted means unfiltered (DEAN/ADMIN, and
 * the `/api/admin/analytics/export` route, which reuses this dashboard
 * school-wide on purpose). */
export async function getHodDashboard(departments?: readonly Department[]): Promise<HodDashboard> {
  const departmentCaseFilter = departments
    ? { student: { department: { in: [...departments] } } }
    : {};
  const departmentStudentFilter = departments ? { department: { in: [...departments] } } : {};

  const [stateCounts, candidates, pendingVerificationCases, rawWaivers, rawRestarts] = await Promise.all([
    prisma.case.groupBy({ by: ["state"], _count: { _all: true }, where: departmentCaseFilter }),
    prisma.student.findMany({
      where: { cases: { none: {} }, ...departmentStudentFilter },
      select: {
        id: true,
        admissionSemesterId: true,
        user: { select: { email: true, fullName: true } },
      },
    }),
    prisma.case.findMany({
      where: { state: "PENDING_VERIFICATION", ...departmentCaseFilter },
      select: {
        id: true,
        student: { select: { user: { select: { email: true, fullName: true } } } },
        company: { select: { name: true } },
      },
    }),
    listWaivers(departments),
    listAllRestartRequests(departments),
  ]);
  const deadlineMissed = await findDeadlineMissedCases(new Date(), departments);

  const waivers: WaiverRow[] = await Promise.all(
    rawWaivers.map(async (w) => ({
      waiverId: w.id,
      studentName: await studentNameById(w.studentId),
      outcome: w.outcome,
      createdAt: w.createdAt,
    })),
  );
  const restarts: RestartRow[] = await Promise.all(
    rawRestarts.map(async (r) => ({
      requestId: r.id,
      studentName: await studentNameByFailedCaseId(r.failedCaseId),
      outcome: r.outcome,
      createdAt: r.createdAt,
    })),
  );

  const semesters: SemesterFact[] = await prisma.semester.findMany({
    select: { id: true, sequenceNumber: true, status: true },
  });

  const overdueEligibility: OverdueEligibilityRow[] = candidates
    .map((student) => {
      const eligibility = computeEligibility(student.admissionSemesterId, semesters);
      return { student, eligibility };
    })
    .filter((row) => row.eligibility.isEligible)
    .map((row) => ({
      studentId: row.student.id,
      studentName: row.student.user.fullName ?? row.student.user.email,
      studentEmail: row.student.user.email,
      semestersCompleted: row.eligibility.semestersCompleted,
    }))
    .sort((a, b) => b.semestersCompleted - a.semestersCompleted);

  return {
    countsByState: stateCounts.map((row) => ({ state: row.state, count: row._count._all })),
    overdueEligibility,
    pendingVerifications: pendingVerificationCases.map((kase) => ({
      caseId: kase.id,
      studentName: kase.student.user.fullName ?? kase.student.user.email,
      companyName: kase.company?.name ?? null,
    })),
    waivers,
    restarts,
    deadlineMissed,
  };
}
