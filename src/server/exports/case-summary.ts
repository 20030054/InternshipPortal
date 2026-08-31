import { prisma } from "@/server/db/client";
import { computeProgressLine, type ProgressLineResult } from "@/server/dashboards/progress-line";

export type CaseSummaryData = {
  caseId: string;
  studentName: string;
  registrationNumber: string;
  programme: string;
  companyName: string | null;
  workDescription: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  progress: ProgressLineResult;
  grade: { value: "P" | "I"; awardedAt: Date } | null;
};

export async function getCaseSummaryData(caseId: string): Promise<CaseSummaryData | null> {
  const kase = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      state: true,
      companyId: true,
      workDescription: true,
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
      company: { select: { name: true } },
      grade: { select: { value: true, createdAt: true } },
      student: {
        select: {
          registrationNumber: true,
          programme: true,
          user: { select: { email: true, fullName: true } },
        },
      },
    },
  });
  if (!kase) return null;

  return {
    caseId: kase.id,
    studentName: kase.student.user.fullName ?? kase.student.user.email,
    registrationNumber: kase.student.registrationNumber,
    programme: kase.student.programme,
    companyName: kase.company?.name ?? null,
    workDescription: kase.workDescription,
    plannedStart: kase.plannedStart,
    plannedEnd: kase.plannedEnd,
    actualStart: kase.actualStart,
    actualEnd: kase.actualEnd,
    progress: computeProgressLine(kase.state),
    grade: kase.grade ? { value: kase.grade.value, awardedAt: kase.grade.createdAt } : null,
  };
}
