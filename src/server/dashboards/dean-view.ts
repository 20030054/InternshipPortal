import { prisma } from "@/server/db/client";
import { getHodDashboard, type HodDashboard } from "./hod-view";

export type DeanActionItem = { kind: "waiver" | "restart_escalation"; studentName: string; id: string };

export type DeanDashboard = HodDashboard & {
  /** Cases specifically awaiting the Dean's own action: a waiver at its
   * final (`WAIVER_COUNTERSIGNED`) stage, or a denied restart request
   * with no ruling yet (M10's `escalateRestart()`). */
  awaitingDean: DeanActionItem[];
};

export async function getDeanDashboard(): Promise<DeanDashboard> {
  const hod = await getHodDashboard();

  const countersignedCases = await prisma.case.findMany({
    where: { state: "WAIVER_COUNTERSIGNED" },
    select: {
      id: true,
      studentId: true,
      student: { select: { user: { select: { email: true, fullName: true } } } },
    },
  });
  const waiverIdByStudentId = new Map(
    (await prisma.waiver.findMany({ select: { id: true, studentId: true } })).map((w) => [w.studentId, w.id]),
  );

  const deniedRestarts = await prisma.restartRequest.findMany({
    where: { outcome: "DENIED" },
    select: {
      id: true,
      failedCaseId: true,
      failedCase: { select: { student: { select: { user: { select: { email: true, fullName: true } } } } } },
    },
  });
  const existingEscalations = await prisma.escalation.findMany({
    where: { subjectType: "RESTART_DENIED" },
    select: { subjectId: true },
  });
  const escalatedCaseIds = new Set(existingEscalations.map((e) => e.subjectId));

  const awaitingDean: DeanActionItem[] = [
    ...countersignedCases.map((kase) => ({
      kind: "waiver" as const,
      studentName: kase.student.user.fullName ?? kase.student.user.email,
      id: waiverIdByStudentId.get(kase.studentId) ?? kase.id,
    })),
    ...deniedRestarts
      .filter((r) => !escalatedCaseIds.has(r.failedCaseId))
      .map((r) => ({
        kind: "restart_escalation" as const,
        studentName: r.failedCase.student.user.fullName ?? r.failedCase.student.user.email,
        id: r.id,
      })),
  ];

  return { ...hod, awaitingDean };
}
