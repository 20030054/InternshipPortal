import { afterEach, describe, expect, it } from "vitest";
import { POST as restartRequestRoute } from "@/app/api/cases/[id]/restart-request/route";
import { GET as listRoute } from "@/app/api/cases/[id]/restart-requests/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createClosedIncompleteCase } from "./support/case-lifecycle";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("M10: restart gate capability checks", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("403s a Student attempting restart.initiate", async () => {
    const { caseId, studentUserId } = await createClosedIncompleteCase(41600);
    sessionState.current = { user: { id: studentUserId } };

    const response = await restartRequestRoute(
      jsonRequest({ newCompanyName: "Globex Inc", newCompanyContact: "hr@globex.test", reason: "attempt" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(403);
  });

  it("401s an unauthenticated caller", async () => {
    const { caseId } = await createClosedIncompleteCase(41620);
    sessionState.current = null;

    const response = await restartRequestRoute(
      jsonRequest({ newCompanyName: "Globex Inc", newCompanyContact: "hr@globex.test", reason: "attempt" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(401);
  });

  it("GET restart-requests 404s for a case the caller doesn't own", async () => {
    const { caseId } = await createClosedIncompleteCase(41640);
    const otherStudent = await createUserFixture();
    await assignRole(otherStudent.id, "STUDENT");
    sessionState.current = { user: { id: otherStudent.id } };

    const response = await listRoute(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(404); // ownership 404, not 403
  });

  it("GET restart-requests works for FOCAL (case.view_any) even with zero requests yet", async () => {
    const { caseId } = await createClosedIncompleteCase(41660);
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await listRoute(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });
});
