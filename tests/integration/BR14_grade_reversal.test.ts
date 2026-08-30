import { afterEach, describe, expect, it } from "vitest";
import { POST as recommendRoute } from "@/app/api/cases/[id]/recommend-grade/route";
import { POST as awardRoute } from "@/app/api/cases/[id]/award-grade/route";
import { POST as reverseRoute } from "@/app/api/grades/[id]/reverse/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createVerifiedCase } from "./support/case-lifecycle";
import { prisma } from "@/server/db/client";
import { appClient } from "./support/db";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** BR-14: grade immutability and the reversal-with-Dean-signature
 * mechanism. BR-15: a CLOSED_PASS case is never reopened, including by
 * a reversal. */
describe("BR-14: grade reversal", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  async function awardedGrade(startSequence: number, value: "P" | "I" = "P") {
    const { caseId, focalUserId } = await createVerifiedCase(startSequence);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };
    await recommendRoute(jsonRequest({ value, reason: "recommendation" }), {
      params: Promise.resolve({ id: caseId }),
    });

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };
    const reasonForIncomplete = value === "I" ? { reason: "incomplete" } : {};
    await awardRoute(jsonRequest({ value, ...reasonForIncomplete }), {
      params: Promise.resolve({ id: caseId }),
    });

    const grade = await prisma.grade.findUniqueOrThrow({ where: { caseId } });
    return { caseId, gradeId: grade.id };
  }

  it("a direct UPDATE against grades fails at the privilege level (BR-14, mirrors M01's own proof)", async () => {
    const { gradeId } = await awardedGrade(6400, "P");
    const db = appClient();
    await db.connect();
    try {
      await expect(
        db.query(`UPDATE grades SET value = 'I' WHERE id = $1`, [gradeId]),
      ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege
    } finally {
      await db.end();
    }
  });

  it("grade_reversals is append-only too (a real gap M01 left that this module's migration closes)", async () => {
    const { gradeId } = await awardedGrade(6405, "P");
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    const response = await reverseRoute(jsonRequest({ reason: "for the record" }), {
      params: Promise.resolve({ id: gradeId }),
    });
    const reversalId = (await response.json()).id;

    const db = appClient();
    await db.connect();
    try {
      await expect(
        db.query(`UPDATE grade_reversals SET reason = 'edited' WHERE id = $1`, [reversalId]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query(`DELETE FROM grade_reversals WHERE id = $1`, [reversalId]),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.end();
    }
  });

  it("a Dean can reverse a grade with a reason", async () => {
    const { gradeId } = await awardedGrade(6410, "P");
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    const response = await reverseRoute(
      jsonRequest({ reason: "awarded in error, evidence was falsified" }),
      { params: Promise.resolve({ id: gradeId }) },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.gradeId).toBe(gradeId);
    expect(body.deanUserId).toBe(dean.id);

    const reversal = await prisma.gradeReversal.findFirstOrThrow({ where: { gradeId } });
    expect(reversal.reason).toContain("falsified");
  });

  it("a non-Dean cannot reverse a grade", async () => {
    const { gradeId } = await awardedGrade(6420, "P");
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await reverseRoute(jsonRequest({ reason: "attempt" }), {
      params: Promise.resolve({ id: gradeId }),
    });
    expect(response.status).toBe(403);
  });

  it("reversal requires a reason", async () => {
    const { gradeId } = await awardedGrade(6430, "P");
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    const response = await reverseRoute(jsonRequest({}), {
      params: Promise.resolve({ id: gradeId }),
    });
    expect(response.status).toBe(400);
  });

  it("a reversal never changes the grade's own value or cases.state (BR-15)", async () => {
    const { caseId, gradeId } = await awardedGrade(6440, "P");
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    await reverseRoute(jsonRequest({ reason: "disputed after the fact" }), {
      params: Promise.resolve({ id: gradeId }),
    });

    const grade = await prisma.grade.findUniqueOrThrow({ where: { id: gradeId } });
    expect(grade.value).toBe("P");

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("CLOSED_PASS");
  });

  it("404s for a nonexistent grade", async () => {
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    const response = await reverseRoute(jsonRequest({ reason: "attempt" }), {
      params: Promise.resolve({ id: "00000000-0000-7000-8000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });
});
