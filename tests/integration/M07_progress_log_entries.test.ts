import { afterEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/cases/[id]/progress-log/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createCaseFixture,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";

function entryRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** `case.progress_log_update` (M02's capability, unused until now):
 * entries only accepted IN_PROGRESS, one per week, immutable once
 * written. */
describe("M07: progress log entries", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("succeeds while IN_PROGRESS", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({
      studentId: student.id,
      state: "IN_PROGRESS",
      plannedStart: new Date("2026-06-01"),
      plannedEnd: new Date("2026-07-13"),
    });
    sessionState.current = { user: { id: student.userId } };

    const response = await POST(entryRequest({ weekNumber: 1, note: "First week, onboarding." }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.weekNumber).toBe(1);
  });

  it("409s outside IN_PROGRESS", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "ELIGIBLE" });
    sessionState.current = { user: { id: student.userId } };

    const response = await POST(entryRequest({ weekNumber: 1, note: "too early" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(409);
  });

  it("409s on a duplicate weekNumber", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    sessionState.current = { user: { id: student.userId } };

    const first = await POST(entryRequest({ weekNumber: 1, note: "week one" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(first.status).toBe(201);

    const second = await POST(entryRequest({ weekNumber: 1, note: "week one again" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(second.status).toBe(409);
  });

  it("404s for another student's case", async () => {
    const owner = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: owner.id, state: "IN_PROGRESS" });

    const other = await createStudentFixture();
    await assignRole(other.userId, "STUDENT");
    sessionState.current = { user: { id: other.userId } };

    const response = await POST(entryRequest({ weekNumber: 1, note: "not mine" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(404);
  });

  it("401s when unauthenticated", async () => {
    const student = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    sessionState.current = null;

    const response = await POST(entryRequest({ weekNumber: 1, note: "x" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(401);
  });

  it("400s on an invalid body (blank note, non-positive week)", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    sessionState.current = { user: { id: student.userId } };

    const blankNote = await POST(entryRequest({ weekNumber: 1, note: "" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(blankNote.status).toBe(400);

    const badWeek = await POST(entryRequest({ weekNumber: 0, note: "x" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(badWeek.status).toBe(400);
  });

  it("GET returns entries in order plus weeksCompleted and hasReachedMidpoint", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({
      studentId: student.id,
      state: "IN_PROGRESS",
      plannedStart: new Date("2026-06-01"),
      plannedEnd: new Date("2026-07-13"), // 6 weeks -> midpoint week 3
    });
    sessionState.current = { user: { id: student.userId } };

    await POST(entryRequest({ weekNumber: 1, note: "week one" }), {
      params: Promise.resolve({ id: kase.id }),
    });
    await POST(entryRequest({ weekNumber: 2, note: "week two" }), {
      params: Promise.resolve({ id: kase.id }),
    });

    const midway = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    const midwayBody = await midway.json();
    expect(midwayBody.weeksCompleted).toBe(2);
    expect(midwayBody.hasReachedMidpoint).toBe(false);

    await POST(entryRequest({ weekNumber: 3, note: "week three, midpoint" }), {
      params: Promise.resolve({ id: kase.id }),
    });

    const after = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    const afterBody = await after.json();
    expect(afterBody.weeksCompleted).toBe(3);
    expect(afterBody.hasReachedMidpoint).toBe(true);
    expect(afterBody.entries.map((e: { weekNumber: number }) => e.weekNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it("GET 404s for another student's case", async () => {
    const owner = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: owner.id, state: "IN_PROGRESS" });

    const other = await createStudentFixture();
    await assignRole(other.userId, "STUDENT");
    sessionState.current = { user: { id: other.userId } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(404);
  });

  it("GET succeeds for a Focal Person regardless of ownership", async () => {
    const owner = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: owner.id, state: "IN_PROGRESS" });

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(200);
  });
});
