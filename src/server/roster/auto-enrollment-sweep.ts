import { prisma } from "@/server/db/client";
import { computeEligibility, type SemesterFact } from "./eligibility";

/**
 * BR-02: "A student who has not opened a case by the end of the 6th
 * semester is auto-enrolled: the system creates a mandatory case... This
 * is not optional and does not wait for a login." Runs as a scheduled
 * BullMQ job (worker/index.ts) and is also triggerable on demand by an
 * Admin (POST /api/admin/roster/sweep-now) for ops/testing.
 *
 * "Has not opened a case" is read as "has zero case rows of any kind" —
 * not just "no non-terminal case" — per docs/modules/M03.md's scope
 * note: a student who never engaged at all is a different situation from
 * one who tried and failed, and only the former is what this sweep
 * exists to catch.
 *
 * Creates the case directly in ELIGIBLE (not ELIGIBILITY_PENDING) — see
 * OPEN_QUESTIONS.md OQ-11. This is a fresh INSERT, not an UPDATE of an
 * existing row's state, so it needs no transition executor (M04) to do
 * correctly: the BEFORE UPDATE OF state trigger from M01 never fires on
 * INSERT.
 */

export type SweepResult = {
  studentsEnrolled: number;
  studentIds: string[];
};

export async function runAutoEnrollmentSweep(): Promise<SweepResult> {
  const semesters: SemesterFact[] = await prisma.semester.findMany({
    select: { id: true, sequenceNumber: true, status: true },
  });

  const candidates = await prisma.student.findMany({
    where: { cases: { none: {} } },
    select: { id: true, admissionSemesterId: true },
  });

  const toEnroll = candidates.filter(
    (student) =>
      computeEligibility(student.admissionSemesterId, semesters)
        .isPastAutoEnrollBoundary,
  );

  const studentIds: string[] = [];
  for (const student of toEnroll) {
    await prisma.$transaction(async (tx) => {
      const created = await tx.case.create({
        data: {
          studentId: student.id,
          state: "ELIGIBLE",
          autoEnrolled: true,
        },
      });
      await tx.auditEvent.create({
        data: {
          systemJob: "roster-sweep",
          eventType: "CASE_AUTO_ENROLLED",
          entityType: "case",
          entityId: created.id,
          metadata: {
            studentId: student.id,
            reason: "BR-02: semester-6 boundary reached with no case",
          },
        },
      });
    });
    studentIds.push(student.id);
  }

  return { studentsEnrolled: studentIds.length, studentIds };
}
