import { prisma } from "@/server/db/client";
import { computeProgressLine, type ProgressLineResult } from "./progress-line";
import { computeEligibility, type SemesterFact } from "@/server/roster/eligibility";

export type StudentDashboard =
  | { status: "no_case"; isEligible: boolean }
  | {
      status: "has_case";
      caseId: string;
      companyName: string | null;
      progress: ProgressLineResult;
      plannedStart: Date | null;
      plannedEnd: Date | null;
      actualStart: Date | null;
      actualEnd: Date | null;
    };

/**
 * §10: "The eight-step progress line is the student's entire home
 * page." A student's *most recent* case (by `createdAt`) is what's
 * shown — after a restart or a terminal outcome they may have more
 * than one row, but only the live/most-recent one is ever "their
 * case" on this screen; older ones are history, not the home page.
 */
export async function getStudentDashboard(studentId: string): Promise<StudentDashboard> {
  const mostRecentCase = await prisma.case.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      state: true,
      companyId: true,
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
      company: { select: { name: true } },
    },
  });

  if (!mostRecentCase) {
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { admissionSemesterId: true },
    });
    const semesters: SemesterFact[] = await prisma.semester.findMany({
      select: { id: true, sequenceNumber: true, status: true },
    });
    const eligibility = computeEligibility(student.admissionSemesterId, semesters);
    return { status: "no_case", isEligible: eligibility.isEligible };
  }

  return {
    status: "has_case",
    caseId: mostRecentCase.id,
    companyName: mostRecentCase.company?.name ?? null,
    progress: computeProgressLine(mostRecentCase.state),
    plannedStart: mostRecentCase.plannedStart,
    plannedEnd: mostRecentCase.plannedEnd,
    actualStart: mostRecentCase.actualStart,
    actualEnd: mostRecentCase.actualEnd,
  };
}
