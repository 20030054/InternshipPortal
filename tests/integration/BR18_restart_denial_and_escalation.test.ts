import { afterEach, describe, expect, it } from "vitest";
import { POST as restartRequestRoute } from "@/app/api/cases/[id]/restart-request/route";
import { POST as denyRoute } from "@/app/api/restart-requests/[id]/deny/route";
import { POST as escalateRoute } from "@/app/api/restart-requests/[id]/escalate/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createClosedIncompleteCase } from "./support/case-lifecycle";
import { prisma } from "@/server/db/client";
import { appClient } from "./support/db";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function pendingRequest(startSequence: number) {
  const { caseId, focalUserId } = await createClosedIncompleteCase(startSequence);
  await assignRole(focalUserId, "FOCAL");
  sessionState.current = { user: { id: focalUserId } };
  const response = await restartRequestRoute(
    jsonRequest({
      newCompanyName: "Globex Inc",
      newCompanyContact: "hr@globex.test",
      reason: "genuine new placement",
    }),
    { params: Promise.resolve({ id: caseId }) },
  );
  const body = await response.json();
  return { caseId, requestId: body.requestId, focalUserId };
}

/** BR-18: explicit HoD denial and the Dean's final, one-shot escalation
 * ruling. */
describe("BR-18: HoD denial", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("an HoD can explicitly deny a pending request", async () => {
    const { caseId, requestId } = await pendingRequest(41300);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await denyRoute(jsonRequest({ reason: "not a genuinely different placement" }), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("DENIED");

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("RESTART_DENIED");
  });

  it("denial requires a reason", async () => {
    const { requestId } = await pendingRequest(41320);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await denyRoute(jsonRequest({}), { params: Promise.resolve({ id: requestId }) });
    expect(response.status).toBe(400);
  });

  it("cannot deny an already-resolved request", async () => {
    const { requestId } = await pendingRequest(41340);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    await denyRoute(jsonRequest({ reason: "first denial" }), { params: Promise.resolve({ id: requestId }) });
    const second = await denyRoute(jsonRequest({ reason: "second attempt" }), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(second.status).toBe(409);
  });
});

describe("BR-18: Dean escalation, final ruling", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a Dean can rule on a denied request", async () => {
    const { requestId } = await pendingRequest(41360);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };
    await denyRoute(jsonRequest({ reason: "denied" }), { params: Promise.resolve({ id: requestId }) });

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    const response = await escalateRoute(
      jsonRequest({ reason: "student appealed the denial", ruling: "denial upheld, no further restart" }),
      { params: Promise.resolve({ id: requestId }) },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.subjectType).toBe("RESTART_DENIED");
    expect(body.ruling).toContain("upheld");
  });

  it("cannot escalate a request that is still PENDING", async () => {
    const { requestId } = await pendingRequest(41380);
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    const response = await escalateRoute(jsonRequest({ reason: "premature", ruling: "n/a" }), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(response.status).toBe(409);
  });

  it("a ruling is final -- a second escalation on the same case 409s", async () => {
    const { requestId } = await pendingRequest(41400);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };
    await denyRoute(jsonRequest({ reason: "denied" }), { params: Promise.resolve({ id: requestId }) });

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    await escalateRoute(jsonRequest({ reason: "first ruling", ruling: "upheld" }), {
      params: Promise.resolve({ id: requestId }),
    });
    const second = await escalateRoute(jsonRequest({ reason: "second attempt", ruling: "changed my mind" }), {
      params: Promise.resolve({ id: requestId }),
    });
    expect(second.status).toBe(409);
  });

  it("a request denied by a guard failure (never reaching RESTART_REQUESTED) is still escalatable -- BR-18 applies uniformly", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(41420);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };
    const requestResponse = await restartRequestRoute(
      jsonRequest({
        newCompanyName: "Acme Corp", // same as failed case's company -- G1 hard block
        newCompanyContact: "hr@acme.test",
        reason: "attempt",
      }),
      { params: Promise.resolve({ id: caseId }) },
    );
    const requestBody = await requestResponse.json();
    expect(requestBody.outcome).toBe("DENIED"); // denied at the door, cases.state never moved

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    const response = await escalateRoute(
      jsonRequest({ reason: "appealed", ruling: "denial upheld -- same organisation" }),
      { params: Promise.resolve({ id: requestBody.requestId }) },
    );
    expect(response.status).toBe(201);
  });

  it("escalations is append-only at the privilege level (mirrors M09's grade_reversals fix)", async () => {
    const { requestId } = await pendingRequest(41440);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };
    await denyRoute(jsonRequest({ reason: "denied" }), { params: Promise.resolve({ id: requestId }) });

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    const response = await escalateRoute(jsonRequest({ reason: "for the record", ruling: "upheld" }), {
      params: Promise.resolve({ id: requestId }),
    });
    const escalationId = (await response.json()).id;

    const db = appClient();
    await db.connect();
    try {
      await expect(
        db.query(`UPDATE escalations SET ruling = 'edited' WHERE id = $1`, [escalationId]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query(`DELETE FROM escalations WHERE id = $1`, [escalationId]),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.end();
    }
  });
});
