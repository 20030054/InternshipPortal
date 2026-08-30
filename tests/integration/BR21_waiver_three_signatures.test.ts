import { afterEach, describe, expect, it } from "vitest";
import { POST as countersignRoute } from "@/app/api/waivers/[id]/countersign/route";
import { POST as hodDenyRoute } from "@/app/api/waivers/[id]/hod-deny/route";
import { POST as approveRoute } from "@/app/api/waivers/[id]/approve/route";
import { POST as deanDenyRoute } from "@/app/api/waivers/[id]/dean-deny/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createCountersignedWaiver, createPendingWaiver } from "./support/waiver-fixtures";
import { prisma } from "@/server/db/client";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** BR-21: the three-signature workflow. Module done-criterion: a waiver
 * cannot be granted with two signatures. */
describe("BR-21: three-signature waiver workflow", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("full happy path: PENDING -> COUNTERSIGNED -> GRANTED, three distinct signers recorded", async () => {
    const { waiverId, caseId, hodUserId } = await createCountersignedWaiver();

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    const response = await approveRoute(jsonRequest({ reason: "final approval granted" }), {
      params: Promise.resolve({ id: waiverId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("GRANTED");
    expect(body.hodSignerId).toBe(hodUserId);
    expect(body.deanSignerId).toBe(dean.id);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("WAIVER_GRANTED");
  });

  it("cannot be granted with two signatures: the Dean cannot approve directly from WAIVER_REQUESTED", async () => {
    const { waiverId } = await createPendingWaiver(); // no HoD countersignature yet

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    const response = await approveRoute(jsonRequest({ reason: "attempt to skip ahead" }), {
      params: Promise.resolve({ id: waiverId }),
    });
    expect(response.status).toBe(409);

    const stored = await prisma.waiver.findUniqueOrThrow({ where: { id: waiverId } });
    expect(stored.outcome).toBe("PENDING");
    expect(stored.deanSignerId).toBeNull();
  });

  it("a non-DEAN (HOD) cannot approve", async () => {
    const { waiverId, hodUserId } = await createCountersignedWaiver();
    sessionState.current = { user: { id: hodUserId } };

    const response = await approveRoute(jsonRequest({ reason: "attempt" }), {
      params: Promise.resolve({ id: waiverId }),
    });
    expect(response.status).toBe(403);
  });

  it("a non-HOD (FOCAL) cannot countersign", async () => {
    const { waiverId, focalUserId } = await createPendingWaiver();
    sessionState.current = { user: { id: focalUserId } };

    const response = await countersignRoute(jsonRequest({ reason: "attempt" }), {
      params: Promise.resolve({ id: waiverId }),
    });
    expect(response.status).toBe(403);
  });

  it("HoD refusal ends it: WAIVER_REQUESTED -> WAIVER_DENIED, no further path", async () => {
    const { waiverId, caseId } = await createPendingWaiver();
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await hodDenyRoute(jsonRequest({ reason: "circumstances not credible" }), {
      params: Promise.resolve({ id: waiverId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("DENIED");

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("WAIVER_DENIED");

    // No further action is possible: the Dean can't approve or deny a
    // request the HoD already ended.
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    const deanAttempt = await approveRoute(jsonRequest({ reason: "attempt" }), {
      params: Promise.resolve({ id: waiverId }),
    });
    expect(deanAttempt.status).toBe(409);
  });

  it("Dean refusal ends it at the final stage: WAIVER_COUNTERSIGNED -> WAIVER_DENIED", async () => {
    const { waiverId, caseId } = await createCountersignedWaiver();
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    const response = await deanDenyRoute(jsonRequest({ reason: "insufficient on final review" }), {
      params: Promise.resolve({ id: waiverId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("DENIED");

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("WAIVER_DENIED");
  });

  it("countersign requires a reason", async () => {
    const { waiverId } = await createPendingWaiver();
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await countersignRoute(jsonRequest({}), { params: Promise.resolve({ id: waiverId }) });
    expect(response.status).toBe(400);
  });

  it("404s a nonexistent waiver id", async () => {
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await countersignRoute(jsonRequest({ reason: "attempt" }), {
      params: Promise.resolve({ id: "00000000-0000-7000-8000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });
});
