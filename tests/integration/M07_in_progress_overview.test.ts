import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cases/in-progress-overview/route";
import { POST as addEntry } from "@/app/api/cases/[id]/progress-log/route";
import { sessionState } from "./setup";
import { assignRole, createCaseFixture, createStudentFixture, createUserFixture } from "./support/prisma-fixtures";

function entryRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** MASTER_PROMPT.md's "Focal Person overview of all in-progress
 * internships" — every IN_PROGRESS case pre-joined with its computed
 * progress summary. */
describe("M07: GET /api/cases/in-progress-overview", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("403s for a Student", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    sessionState.current = { user: { id: student.userId } };

    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("401s when unauthenticated", async () => {
    sessionState.current = null;
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("200s for Focal/HoD/Dean and reports the real logged progress", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({
      studentId: student.id,
      state: "IN_PROGRESS",
      plannedStart: new Date("2026-06-01"),
      plannedEnd: new Date("2026-07-13"), // 6 weeks -> midpoint week 3
    });

    sessionState.current = { user: { id: student.userId } };
    await addEntry(entryRequest({ weekNumber: 1, note: "week one" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    await addEntry(entryRequest({ weekNumber: 2, note: "week two" }), {
      params: Promise.resolve({ id: kase.id }),
    });

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();

    const row = body.find((r: { caseId: string }) => r.caseId === kase.id);
    expect(row).toBeDefined();
    expect(row.weeksCompleted).toBe(2);
    expect(row.hasReachedMidpoint).toBe(false);
  });

  it("excludes cases in other states", async () => {
    const student = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: student.id, state: "DOCS_PENDING" });

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await GET();
    const body = await response.json();
    expect(body.find((r: { caseId: string }) => r.caseId === kase.id)).toBeUndefined();
  });
});
