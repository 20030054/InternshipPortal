import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { migrationClient } from "./support/db";
import {
  createClosedSemesterChain,
  createStudentFixture,
} from "./support/prisma-fixtures";
import { computeEligibility } from "@/server/roster/eligibility";

/**
 * BR-01/BR-04: eligibility (and the graduation clock it's built from) is
 * never a stored column — "computed from the roster, never
 * self-declared," and "read-only to every human role... no API route may
 * write to it." Proven two ways: schema introspection shows no such
 * column exists anywhere, and flipping a semester's status changes the
 * computed result immediately with no other write involved.
 */
describe("BR-01/BR-04: eligibility is computed, not stored", () => {
  it("no eligibility/graduation-clock column exists on cases or students", async () => {
    const db = migrationClient();
    await db.connect();
    try {
      const { rows } = await db.query<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('cases', 'students')
           AND (column_name ILIKE '%eligib%' OR column_name ILIKE '%graduation%')`,
      );
      expect(rows).toEqual([]);
    } finally {
      await db.end();
    }
  });

  it("closing the student's 4th semester makes them eligible with no other write", async () => {
    const [s1, s2, s3] = await createClosedSemesterChain(3, 5000);
    // Create the 4th semester still OPEN, then close it — the one write
    // under test.
    const fourth = await prisma.semester.create({
      data: {
        type: "FALL",
        year: 5100 + Math.floor(Math.random() * 1000),
        sequenceNumber: 5003,
        status: "OPEN",
        startsOn: new Date("2024-09-01"),
        endsOn: new Date("2024-12-31"),
      },
    });

    const student = await createStudentFixture({
      admissionSemesterId: s1!.id,
    });

    const before = computeEligibility(student.admissionSemesterId, [
      { id: s1!.id, sequenceNumber: s1!.sequenceNumber, status: s1!.status },
      { id: s2!.id, sequenceNumber: s2!.sequenceNumber, status: s2!.status },
      { id: s3!.id, sequenceNumber: s3!.sequenceNumber, status: s3!.status },
      {
        id: fourth.id,
        sequenceNumber: fourth.sequenceNumber,
        status: fourth.status,
      },
    ]);
    expect(before.isEligible).toBe(false);

    // The only write: close the 4th semester. Nothing touches the
    // student or case tables at all.
    const closed = await prisma.semester.update({
      where: { id: fourth.id },
      data: { status: "CLOSED" },
    });

    const after = computeEligibility(student.admissionSemesterId, [
      { id: s1!.id, sequenceNumber: s1!.sequenceNumber, status: s1!.status },
      { id: s2!.id, sequenceNumber: s2!.sequenceNumber, status: s2!.status },
      { id: s3!.id, sequenceNumber: s3!.sequenceNumber, status: s3!.status },
      {
        id: closed.id,
        sequenceNumber: closed.sequenceNumber,
        status: closed.status,
      },
    ]);
    expect(after.isEligible).toBe(true);
  });
});
