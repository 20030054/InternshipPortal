import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/students/[id]/eligibility/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createClosedSemesterChain,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";

describe("M03: GET /api/students/:id/eligibility — same ownership pattern as M02", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a student reading their own eligibility succeeds", async () => {
    const semesters = await createClosedSemesterChain(4, 50_000);
    const student = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });
    await assignRole(student.userId, "STUDENT");
    sessionState.current = { user: { id: student.userId } };

    const response = await GET(
      new Request(`http://test/api/students/${student.id}/eligibility`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isEligible).toBe(true);
    expect(body.semestersCompleted).toBe(4);
  });

  it("a student reading another student's eligibility gets 404", async () => {
    const semesters = await createClosedSemesterChain(1, 60_000);
    const me = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });
    await assignRole(me.userId, "STUDENT");
    const other = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });

    sessionState.current = { user: { id: me.userId } };

    const response = await GET(
      new Request(`http://test/api/students/${other.id}/eligibility`),
      { params: Promise.resolve({ id: other.id }) },
    );

    expect(response.status).toBe(404);
  });

  it("a HoD can read any student's eligibility", async () => {
    const semesters = await createClosedSemesterChain(1, 70_000);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    const student = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });

    sessionState.current = { user: { id: hod.id } };

    const response = await GET(
      new Request(`http://test/api/students/${student.id}/eligibility`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(200);
  });

  it("an unauthenticated request gets 401", async () => {
    const semesters = await createClosedSemesterChain(1, 80_000);
    const student = await createStudentFixture({
      admissionSemesterId: semesters[0]!.id,
    });
    sessionState.current = null;

    const response = await GET(
      new Request(`http://test/api/students/${student.id}/eligibility`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(401);
  });
});
