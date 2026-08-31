import { afterEach, describe, expect, it } from "vitest";
import { POST as postWithdraw } from "@/app/api/cases/[id]/withdraw/route";
import { sessionState } from "./setup";
import { assignRole, createCaseFixture, createStudentFixture, createUserFixture } from "./support/prisma-fixtures";

/**
 * D-118 (supersedes D-115): `case.withdraw` — §1.2's third exception
 * path. `createCaseFixture()` is used throughout, not
 * `createEligibleStudent()`/`openCase()` — this file only cares "does
 * the route fire the right one of M04's five `-> WITHDRAWN` rows for a
 * case already sitting at its `from` state," the same scoping
 * `createCaseFixture()`'s own doc comment describes for M04's fixtures
 * generally, and its default semester (`UPCOMING`, not `CLOSED`) keeps
 * this file immune to the exact-CLOSED-semester-count fragility
 * M14_BR03_graduation_eligibility.test.ts documents in detail.
 */
describe("D-118: case withdrawal (§1.2's third exception path)", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it.each(["ELIGIBILITY_PENDING", "ELIGIBLE", "OFFER_SUBMITTED", "OFFER_UNDER_REVIEW", "OFFER_REJECTED"] as const)(
    "the owning student can withdraw from %s",
    async (state) => {
      const student = await createStudentFixture();
      await assignRole(student.userId, "STUDENT");
      const kase = await createCaseFixture({ studentId: student.id, state });
      sessionState.current = { user: { id: student.userId } };

      const response = await postWithdraw(new Request("http://test", { method: "POST" }), {
        params: Promise.resolve({ id: kase.id }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.state).toBe("WITHDRAWN");
    },
  );

  it("a Student can't withdraw another student's case (404, not 403)", async () => {
    const owner = await createStudentFixture();
    await assignRole(owner.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: owner.id, state: "ELIGIBLE" });

    const other = await createUserFixture();
    await assignRole(other.id, "STUDENT");
    sessionState.current = { user: { id: other.id } };

    const response = await postWithdraw(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(404);
  });

  it("a case already past approval can't be withdrawn (409, not a crash)", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    sessionState.current = { user: { id: student.userId } };

    const response = await postWithdraw(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(409);
  });

  it("a Focal Person can't withdraw a case — students only (403, wrong capability)", async () => {
    const student = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: student.id, state: "ELIGIBLE" });
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await postWithdraw(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(403);
  });

  it("an unauthenticated request gets 401", async () => {
    const student = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: student.id, state: "ELIGIBLE" });
    sessionState.current = null;

    const response = await postWithdraw(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(401);
  });
});
