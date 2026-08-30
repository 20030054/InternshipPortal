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

/**
 * MASTER_PROMPT.md §2.3/BR-12, and this module's own stated done
 * criterion: "a user holding both Focal and HoD roles cannot complete
 * both halves on one case." Proven end to end through the real routes —
 * `guards.test.ts` (M04) already covers `recommenderNotAwarder` in
 * isolation; this is the first real caller putting it to work.
 */
describe("BR-12: the same account cannot both recommend and award a grade", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a user holding both FOCAL and HOD roles is blocked from awarding their own recommendation", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(6300);
    // The same account holds both roles.
    await assignRole(focalUserId, "FOCAL");
    await assignRole(focalUserId, "HOD");

    sessionState.current = { user: { id: focalUserId } };
    const recommendResponse = await recommendRoute(
      jsonRequest({ value: "P", reason: "satisfactory" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(recommendResponse.status).toBe(200);

    // Still the same session/account, now attempting to award.
    const awardResponse = await awardRoute(jsonRequest({ value: "P" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(awardResponse.status).toBe(422);
    const body = await awardResponse.json();
    expect(body.reasons.join(" ")).toContain("BR-12");

    // No Grade row was created by the rejected attempt.
    const grade = await prisma.grade.findUnique({ where: { caseId } });
    expect(grade).toBeNull();

    // The case is still sitting in GRADE_RECOMMENDED, not silently
    // advanced or corrupted by the failed award attempt.
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("GRADE_RECOMMENDED");
  });

  it("a genuinely different HoD account can award the same recommendation", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(6310);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };
    await recommendRoute(jsonRequest({ value: "P", reason: "satisfactory" }), {
      params: Promise.resolve({ id: caseId }),
    });

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const awardResponse = await awardRoute(jsonRequest({ value: "P" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(awardResponse.status).toBe(200);

    const grade = await prisma.grade.findUniqueOrThrow({ where: { caseId } });
    expect(grade.recommendedBy).toBe(focalUserId);
    expect(grade.awardedBy).toBe(hod.id);
  });
});
