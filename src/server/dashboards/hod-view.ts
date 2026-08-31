import type { CaseState, RestartOutcome, WaiverOutcome } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { computeEligibility, type SemesterFact } from "@/server/roster/eligibility";
import { listWaivers } from "@/server/waivers/service";
import { listAllRestartRequests } from "@/server/restart/service";

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

export async function getHodDashboard(): Promise<HodDashboard> {
  const [stateCounts, candidates, pendingVerificationCases, rawWaivers, rawRestarts] = await Promise.all([
    prisma.case.groupBy({ by: ["state"], _count: { _all: true } }),
    prisma.student.findMany({
      where: { cases: { none: {} } },
      select: {
        id: true,
        admissionSemesterId: true,
        user: { select: { email: true, fullName: true } },
      },
    }),
    prisma.case.findMany({
      where: { state: "PENDING_VERIFICATION" },
      select: {
        id: true,
        student: { select: { user: { select: { email: true, fullName: true } } } },
        company: { select: { name: true } },
      },
    }),
    listWaivers(),
    listAllRestartRequests(),
  ]);

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
  };
}
