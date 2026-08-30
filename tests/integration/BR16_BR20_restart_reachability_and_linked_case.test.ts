import { afterEach, describe, expect, it } from "vitest";
import { POST as restartRequestRoute } from "@/app/api/cases/[id]/restart-request/route";
import { POST as countersignRoute } from "@/app/api/restart-requests/[id]/countersign/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createClosedIncompleteCase, createVerifiedCase } from "./support/case-lifecycle";
import { prisma } from "@/server/db/client";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function initiateAndCountersign(startSequence: number, companyName = "Globex Inc") {
  const { caseId, focalUserId } = await createClosedIncompleteCase(startSequence);
  sessionState.current = { user: { id: focalUserId } };
  const requestResponse = await restartRequestRoute(
    jsonRequest({
      newCompanyName: companyName,
      newCompanyContact: "hr@globex.test",
      reason: "student found a genuinely different placement",
    }),
    { params: Promise.resolve({ id: caseId }) },
  );
  const requestBody = await requestResponse.json();

  const hod = await createUserFixture();
  await assignRole(hod.id, "HOD");
  sessionState.current = { user: { id: hod.id } };
  const countersignResponse = await countersignRoute(
    jsonRequest({ reason: "confirmed, distinct placement" }),
    { params: Promise.resolve({ id: requestBody.requestId }) },
  );
  return { caseId, requestId: requestBody.requestId, countersignResponse, focalUserId, hodUserId: hod.id };
}

/** BR-16: restart is reachable only from CLOSED_INCOMPLETE. */
describe("BR-16: restart reachable only from CLOSED_INCOMPLETE", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("409s a restart-request against a case that is not CLOSED_INCOMPLETE", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(41000);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };

    const response = await restartRequestRoute(
      jsonRequest({
        newCompanyName: "Globex Inc",
        newCompanyContact: "hr@globex.test",
        reason: "attempt",
      }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(409);

    const requests = await prisma.restartRequest.findMany({ where: { failedCaseId: caseId } });
    expect(requests).toHaveLength(0); // structural rejection, no request row at all
  });
});

/** BR-20: a restart creates a new, linked Case; the failed case is
 * never mutated beyond RESTART_AUTHORIZED. */
describe("BR-20: restart creates a new linked case", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("creates a new Case in ELIGIBLE with previousCaseId set, and companyId null (BR-07/BR-09 still apply)", async () => {
    const { caseId, countersignResponse } = await initiateAndCountersign(41020);
    expect(countersignResponse.status).toBe(200);
    const body = await countersignResponse.json();

    expect(body.newCase.state).toBe("ELIGIBLE");
    expect(body.newCase.previousCaseId).toBe(caseId);
    expect(body.newCase.companyId).toBeNull();
    expect(body.newCase.id).not.toBe(caseId);

    // BR-20's "remains CLOSED_INCOMPLETE forever" is about history, not the
    // live `state` column: M04's own transition table (already shipped,
    // already tested) walks the failed case itself through
    // RESTART_REQUESTED -> RESTART_AUTHORIZED -- that terminal value is
    // what `cases.state` ends at. "Forever" is `case_events`' append-only
    // trail preserving that it passed through CLOSED_INCOMPLETE, never
    // rewritten -- see D-063.
    const oldCase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(oldCase.state).toBe("RESTART_AUTHORIZED");

    const events = await prisma.caseEvent.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
      select: { fromState: true, toState: true },
    });
    expect(events.some((e) => e.fromState === "CLOSED_INCOMPLETE" && e.toState === "RESTART_REQUESTED")).toBe(true);
  });

  it("logs a CASE_RESTARTED audit event for the new case", async () => {
    const { countersignResponse, caseId } = await initiateAndCountersign(41040);
    const body = await countersignResponse.json();

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "case", entityId: body.newCase.id, eventType: "CASE_RESTARTED" },
    });
    expect((event.metadata as { previousCaseId: string }).previousCaseId).toBe(caseId);
  });
});
