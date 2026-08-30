import { afterEach, describe, expect, it } from "vitest";
import { GET as listRoute } from "@/app/api/waivers/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createPendingWaiver } from "./support/waiver-fixtures";

/** BR-24: "every waiver is surfaced permanently" -- the staff-facing
 * list this module provides (full dashboard/report is M13's job). */
describe("BR-24: waiver visibility", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("FOCAL/HOD/DEAN can all list waivers, including a still-pending one", async () => {
    const { waiverId } = await createPendingWaiver();

    for (const role of ["FOCAL", "HOD", "DEAN"] as const) {
      const user = await createUserFixture();
      await assignRole(user.id, role);
      sessionState.current = { user: { id: user.id } };

      const response = await listRoute();
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.some((w: { id: string }) => w.id === waiverId)).toBe(true);
    }
  });

  it("a STUDENT cannot list waivers", async () => {
    const student = await createUserFixture();
    await assignRole(student.id, "STUDENT");
    sessionState.current = { user: { id: student.id } };

    const response = await listRoute();
    expect(response.status).toBe(403);
  });

  it("401s an unauthenticated caller", async () => {
    sessionState.current = null;
    const response = await listRoute();
    expect(response.status).toBe(401);
  });
});
