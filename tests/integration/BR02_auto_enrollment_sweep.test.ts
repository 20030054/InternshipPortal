import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { runAutoEnrollmentSweep } from "@/server/roster/auto-enrollment-sweep";
import {
  createClosedSemesterChain,
  createStudentFixture,
} from "./support/prisma-fixtures";

describe("BR-02: auto-enrollment sweep", () => {
  it("enrolls a student with 6 closed semesters and zero cases", async () => {
    const semesters = await createClosedSemesterChain(6, 10_000);
    const student = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });

    const result = await runAutoEnrollmentSweep();

    expect(result.studentIds).toContain(student.id);

    const cases = await prisma.case.findMany({
      where: { studentId: student.id },
    });
    expect(cases).toHaveLength(1);
    expect(cases[0]?.state).toBe("ELIGIBLE");
    expect(cases[0]?.autoEnrolled).toBe(true);

    const auditRow = await prisma.auditEvent.findFirst({
      where: { entityType: "case", entityId: cases[0]!.id },
    });
    expect(auditRow?.systemJob).toBe("roster-sweep");
    expect(auditRow?.eventType).toBe("CASE_AUTO_ENROLLED");
  });

  it("running the sweep twice does not create a second case", async () => {
    const semesters = await createClosedSemesterChain(6, 20_000);
    const student = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });

    const first = await runAutoEnrollmentSweep();
    expect(first.studentIds).toContain(student.id);

    const second = await runAutoEnrollmentSweep();
    expect(second.studentIds).not.toContain(student.id);

    const cases = await prisma.case.findMany({
      where: { studentId: student.id },
    });
    expect(cases).toHaveLength(1);
  });

  it("does not touch a student who already has a case, even a terminal one, past the boundary", async () => {
    const semesters = await createClosedSemesterChain(6, 30_000);
    const student = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });
    await prisma.case.create({
      data: {
        studentId: student.id,
        state: "WITHDRAWN",
        updatedAt: new Date(),
      },
    });

    const result = await runAutoEnrollmentSweep();

    expect(result.studentIds).not.toContain(student.id);
    const cases = await prisma.case.findMany({
      where: { studentId: student.id },
    });
    expect(cases).toHaveLength(1);
    expect(cases[0]?.autoEnrolled).toBe(false);
  });

  it("does not enroll a student with only 5 closed semesters", async () => {
    const semesters = await createClosedSemesterChain(5, 40_000);
    const student = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });

    const result = await runAutoEnrollmentSweep();

    expect(result.studentIds).not.toContain(student.id);
    const cases = await prisma.case.findMany({
      where: { studentId: student.id },
    });
    expect(cases).toHaveLength(0);
  });
});
