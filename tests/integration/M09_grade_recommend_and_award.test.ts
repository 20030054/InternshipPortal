import { afterEach, describe, expect, it } from "vitest";
import { POST as recommendRoute } from "@/app/api/cases/[id]/recommend-grade/route";
import { POST as awardRoute } from "@/app/api/cases/[id]/award-grade/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createVerifiedCase } from "./support/case-lifecycle";
import { prisma } from "@/server/db/client";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Rows 11-13: recommend (FOCAL) then award (HOD). */
describe("M09: grade recommendation and award", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("recommend requires a reason", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(6200);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };

    const response = await recommendRoute(jsonRequest({ value: "P" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(400); // zod: reason missing
  });

  it("recommend succeeds, moving the case to GRADE_RECOMMENDED", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(6210);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };

    const response = await recommendRoute(
      jsonRequest({ value: "P", reason: "all deliverables satisfactory" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("GRADE_RECOMMENDED");

    const refreshed = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(refreshed.recommendedGradeValue).toBe("P");
    expect(refreshed.recommendedBy).toBe(focalUserId);
  });

  async function recommendedCase(startSequence: number, value: "P" | "I" = "P") {
    const { caseId, focalUserId } = await createVerifiedCase(startSequence);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };
    await recommendRoute(jsonRequest({ value, reason: "recommendation reason" }), {
      params: Promise.resolve({ id: caseId }),
    });
    return { caseId, focalUserId };
  }

  it("award creates the immutable Grade row with the right recommendedBy/awardedBy/value", async () => {
    const { caseId, focalUserId } = await recommendedCase(6220, "P");
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await awardRoute(jsonRequest({ value: "P" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.case.state).toBe("CLOSED_PASS");
    expect(body.grade.value).toBe("P");
    expect(body.grade.recommendedBy).toBe(focalUserId);
    expect(body.grade.awardedBy).toBe(hod.id);

    const grade = await prisma.grade.findUniqueOrThrow({ where: { caseId } });
    expect(grade.value).toBe("P");
  });

  it("award targets CLOSED_INCOMPLETE and requires a reason when value is I", async () => {
    const { caseId } = await recommendedCase(6230, "I");
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const missingReason = await awardRoute(jsonRequest({ value: "I" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(missingReason.status).toBe(409); // MissingReasonError -> invalid_state

    const withReason = await awardRoute(
      jsonRequest({ value: "I", reason: "deliverables incomplete" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(withReason.status).toBe(200);
    const body = await withReason.json();
    expect(body.case.state).toBe("CLOSED_INCOMPLETE");
  });

  it("CLOSED_PASS requires no reason (M04's existing row shape)", async () => {
    const { caseId } = await recommendedCase(6240, "P");
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await awardRoute(jsonRequest({ value: "P" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
  });

  it("the HoD's award value can differ from the Focal Person's recommendation", async () => {
    const { caseId } = await recommendedCase(6250, "P"); // recommended Pass
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    // HoD independently decides Incomplete instead.
    const response = await awardRoute(
      jsonRequest({ value: "I", reason: "HoD disagrees with the recommendation" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.case.state).toBe("CLOSED_INCOMPLETE");
    expect(body.grade.value).toBe("I");
  });

  it("award 409s when there is no recommendation on record", async () => {
    const { caseId } = await createVerifiedCase(6260);
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await awardRoute(jsonRequest({ value: "P" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(409);
  });

  it("award 403s a non-HoD session", async () => {
    const { caseId, focalUserId } = await recommendedCase(6270, "P");
    sessionState.current = { user: { id: focalUserId } };

    const response = await awardRoute(jsonRequest({ value: "P" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(403);
  });
});
