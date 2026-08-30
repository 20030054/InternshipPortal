import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { createCaseFixture, createStudentFixture } from "./support/prisma-fixtures";

/**
 * Proves M04's migration fix (docs/modules/M04.md "Scope decisions"):
 * RESTART_AUTHORIZED is now in the BR-06 partial index's terminal-states
 * exclusion list, so a case sitting there no longer blocks a new
 * non-terminal case for the same student — which it would have under
 * M01's original list, exactly when the restart gate's "(system) creates
 * new case in ELIGIBLE" step needs to run.
 */
describe("BR-06 fix: RESTART_AUTHORIZED is terminal for the one-non-terminal-case rule", () => {
  it("a new ELIGIBLE case can be created for a student whose other case is RESTART_AUTHORIZED", async () => {
    const student = await createStudentFixture();
    await createCaseFixture({ studentId: student.id, state: "RESTART_AUTHORIZED" });

    await expect(
      createCaseFixture({ studentId: student.id, state: "ELIGIBLE" }),
    ).resolves.toMatchObject({ state: "ELIGIBLE" });
  });

  it("by contrast, a student with a case still in RESTART_REQUESTED (non-terminal) blocks a second case", async () => {
    const student = await createStudentFixture();
    await createCaseFixture({ studentId: student.id, state: "RESTART_REQUESTED" });

    await expect(
      createCaseFixture({ studentId: student.id, state: "ELIGIBLE" }),
    ).rejects.toMatchObject({ code: "P2002" }); // Prisma's unique-constraint error code
  });

  it("the underlying index directly: two RESTART_AUTHORIZED-adjacent cases coexist at the SQL level", async () => {
    const student = await createStudentFixture();
    const first = await createCaseFixture({
      studentId: student.id,
      state: "RESTART_AUTHORIZED",
    });
    const second = await createCaseFixture({
      studentId: student.id,
      state: "ELIGIBLE",
      previousCaseId: first.id,
    });

    expect(second.previousCaseId).toBe(first.id);

    const bothRows = await prisma.case.findMany({
      where: { studentId: student.id },
    });
    expect(bothRows).toHaveLength(2);
  });
});
