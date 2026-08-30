import { afterEach, describe, expect, it } from "vitest";
import { POST as completeInternshipRoute } from "@/app/api/cases/[id]/complete-internship/route";
import { GET as getCase } from "@/app/api/cases/[id]/route";
import { sessionState } from "./setup";
import { assignRole, createCaseFixture, createStudentFixture } from "./support/prisma-fixtures";
import { prisma } from "@/server/db/client";

function completeRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/**
 * BR-08 (the actual-dates half, real as of M07): "the system records
 * planned dates at approval and actual dates at completion." Recording
 * actual dates fires the real IN_PROGRESS -> DOCS_PENDING transition
 * (row 8), and afterwards GET /api/cases/:id reports the computed
 * durationVariance.
 */
describe("BR-08: completing an internship records actual dates and reports variance", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  async function inProgressCase(plannedStart: string, plannedEnd: string) {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({
      studentId: student.id,
      state: "IN_PROGRESS",
      plannedStart: new Date(plannedStart),
      plannedEnd: new Date(plannedEnd),
    });
    sessionState.current = { user: { id: student.userId } };
    return kase.id;
  }

  it("400s when a date is missing", async () => {
    const caseId = await inProgressCase("2026-06-01", "2026-07-13");
    const response = await completeInternshipRoute(
      completeRequest({ actualStart: "2026-06-01" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(400);
  });

  it("422s when actualEnd is not after actualStart", async () => {
    const caseId = await inProgressCase("2026-06-01", "2026-07-13");
    const response = await completeInternshipRoute(
      completeRequest({ actualStart: "2026-07-13", actualEnd: "2026-06-01" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(422);
  });

  it("succeeds with a matching duration: no variance, state moves to DOCS_PENDING", async () => {
    const caseId = await inProgressCase("2026-06-01", "2026-07-13"); // 6 weeks

    const response = await completeInternshipRoute(
      completeRequest({ actualStart: "2026-06-01", actualEnd: "2026-07-13" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("DOCS_PENDING");

    const refreshed = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(refreshed.actualStart?.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(refreshed.actualEnd?.toISOString().slice(0, 10)).toBe("2026-07-13");

    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId, toState: "DOCS_PENDING" },
    });
    expect(event.fromState).toBe("IN_PROGRESS");

    const viewResponse = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    const viewBody = await viewResponse.json();
    expect(viewBody.durationVariance).toEqual({
      plannedWeeks: 6,
      actualWeeks: 6,
      varianceWeeks: 0,
      hasVariance: false,
    });
  });

  it("succeeds with a differing duration: variance flagged, transition still fires", async () => {
    const caseId = await inProgressCase("2026-06-01", "2026-07-13"); // planned 6 weeks

    const response = await completeInternshipRoute(
      completeRequest({ actualStart: "2026-06-01", actualEnd: "2026-07-27" }), // actual 8 weeks
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("DOCS_PENDING");

    const viewResponse = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    const viewBody = await viewResponse.json();
    expect(viewBody.durationVariance.hasVariance).toBe(true);
    expect(viewBody.durationVariance.varianceWeeks).toBe(2);
  });

  it("GET /api/cases/:id reports durationVariance: null before completion", async () => {
    const caseId = await inProgressCase("2026-06-01", "2026-07-13");

    const viewResponse = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    const viewBody = await viewResponse.json();
    expect(viewBody.durationVariance).toBeNull();
  });

  it("404s for another student's case", async () => {
    const owner = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: owner.id, state: "IN_PROGRESS" });

    const other = await createStudentFixture();
    await assignRole(other.userId, "STUDENT");
    sessionState.current = { user: { id: other.userId } };

    const response = await completeInternshipRoute(
      completeRequest({ actualStart: "2026-06-01", actualEnd: "2026-07-13" }),
      { params: Promise.resolve({ id: kase.id }) },
    );
    expect(response.status).toBe(404);
  });
});
