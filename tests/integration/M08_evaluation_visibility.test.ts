import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cases/[id]/evaluation/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createCaseFixture,
  createCompanyFixture,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";

/**
 * MASTER_PROMPT.md §9 "Privacy": "Evaluation comments are visible to
 * Focal Person and HoD only, never to the student, unless the
 * department later decides otherwise (make this a config flag,
 * defaulted to hidden)."
 */
describe("M08: GET /api/cases/:id/evaluation visibility", () => {
  const originalFlag = process.env.SHOW_EVALUATION_TO_STUDENT;

  afterEach(() => {
    sessionState.current = null;
    if (originalFlag === undefined) {
      delete process.env.SHOW_EVALUATION_TO_STUDENT;
    } else {
      process.env.SHOW_EVALUATION_TO_STUDENT = originalFlag;
    }
  });

  async function caseWithSubmittedEvaluation() {
    const student = await createStudentFixture();
    const company = await createCompanyFixture();
    const kase = await createCaseFixture({
      studentId: student.id,
      state: "DOCS_PENDING",
      companyId: company.id,
    });
    const focal = await createUserFixture();
    const { rawToken } = await issueSupervisorToken({
      caseId: kase.id,
      supervisorEmail: "supervisor@acme.test",
      issuedBy: focal.id,
    });
    await submitEvaluation({
      rawToken,
      performanceRating: 5,
      comments: "Excellent.",
    });
    return { caseId: kase.id, studentUserId: student.userId };
  }

  it("404s if no evaluation exists yet", async () => {
    const student = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: student.id, state: "DOCS_PENDING" });
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(404);
  });

  it("a Focal Person can always see it, flag or no flag", async () => {
    delete process.env.SHOW_EVALUATION_TO_STUDENT;
    const { caseId } = await caseWithSubmittedEvaluation();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toEqual({ performanceRating: 5, comments: "Excellent." });
  });

  it("a HoD can always see it too", async () => {
    delete process.env.SHOW_EVALUATION_TO_STUDENT;
    const { caseId } = await caseWithSubmittedEvaluation();
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
  });

  describe("with the flag off (default)", () => {
    beforeEach(() => {
      delete process.env.SHOW_EVALUATION_TO_STUDENT;
    });

    it("403s the owning student", async () => {
      const { caseId, studentUserId } = await caseWithSubmittedEvaluation();
      await assignRole(studentUserId, "STUDENT");
      sessionState.current = { user: { id: studentUserId } };

      const response = await GET(new Request("http://test"), {
        params: Promise.resolve({ id: caseId }),
      });
      expect(response.status).toBe(403);
    });
  });

  describe("with the flag on", () => {
    beforeEach(() => {
      process.env.SHOW_EVALUATION_TO_STUDENT = "true";
    });

    it("lets the owning student see it", async () => {
      const { caseId, studentUserId } = await caseWithSubmittedEvaluation();
      await assignRole(studentUserId, "STUDENT");
      sessionState.current = { user: { id: studentUserId } };

      const response = await GET(new Request("http://test"), {
        params: Promise.resolve({ id: caseId }),
      });
      expect(response.status).toBe(200);
    });

    it("still 404s another student entirely (ownership beats the flag)", async () => {
      const { caseId } = await caseWithSubmittedEvaluation();
      const other = await createStudentFixture();
      await assignRole(other.userId, "STUDENT");
      sessionState.current = { user: { id: other.userId } };

      const response = await GET(new Request("http://test"), {
        params: Promise.resolve({ id: caseId }),
      });
      expect(response.status).toBe(404);
    });
  });

  it("401s when unauthenticated", async () => {
    const { caseId } = await caseWithSubmittedEvaluation();
    sessionState.current = null;

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(401);
  });
});
