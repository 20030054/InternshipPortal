import type { CaseState, WaiverOutcome } from "@prisma/client";
import { prisma } from "@/server/db/client";

/**
 * M15's `/waivers` page — BR-24's "staff-only visibility" list
 * (`listWaivers()`, M11) with enough joined context to decide which
 * inline action (HoD counter-sign/deny, Dean approve/deny) applies to
 * which row. `caseState` is the associated `WAIVER_*` case's current
 * state (OQ-12/D-032: a waiver always genesis-inserts its own real
 * `Case` row) — `null` only if that case has since moved on in a way
 * this page doesn't otherwise expect.
 */
export type WaiverDetailRow = {
  id: string;
  studentName: string;
  circumstance: string;
  focalReason: string | null;
  hodReason: string | null;
  outcome: WaiverOutcome;
  caseState: CaseState | null;
  createdAt: Date;
};

const WAIVER_CASE_STATES: readonly CaseState[] = [
  "WAIVER_REQUESTED",
  "WAIVER_COUNTERSIGNED",
  "WAIVER_GRANTED",
  "WAIVER_DENIED",
];

export async function listWaiverDetails(): Promise<WaiverDetailRow[]> {
  const waivers = await prisma.waiver.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      studentId: true,
      circumstance: true,
      focalReason: true,
      hodReason: true,
      outcome: true,
      createdAt: true,
      student: { select: { user: { select: { fullName: true, email: true } } } },
    },
  });

  const cases = await prisma.case.findMany({
    where: {
      studentId: { in: waivers.map((w) => w.studentId) },
      state: { in: [...WAIVER_CASE_STATES] },
    },
    select: { studentId: true, state: true },
  });
  const caseStateByStudent = new Map(cases.map((c) => [c.studentId, c.state]));

  return waivers.map((w) => ({
    id: w.id,
    studentName: w.student.user.fullName ?? w.student.user.email,
    circumstance: w.circumstance,
    focalReason: w.focalReason,
    hodReason: w.hodReason,
    outcome: w.outcome,
    caseState: caseStateByStudent.get(w.studentId) ?? null,
    createdAt: w.createdAt,
  }));
}
