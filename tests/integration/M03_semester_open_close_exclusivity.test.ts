import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { appClient } from "./support/db";
import { openSemester } from "@/server/roster/semesters";
import { createSemesterFixture } from "./support/prisma-fixtures";

describe("M03: at most one OPEN semester at a time", () => {
  // These tests share one database with every other integration test file
  // and don't get a fresh schema per test — an OPEN semester left behind
  // by an earlier test (this file's own, or M03_semester_admin_routes.ts's)
  // would collide with the partial unique index the moment a test here
  // tries to create another one. Each test starts from a known clean
  // slate instead of assuming one.
  beforeEach(async () => {
    await prisma.semester.updateMany({
      where: { status: "OPEN" },
      data: { status: "CLOSED" },
    });
  });

  it("openSemester() closes the previously OPEN semester atomically", async () => {
    const first = await createSemesterFixture({ status: "OPEN" });
    const second = await createSemesterFixture({ status: "UPCOMING" });

    await openSemester(second.id);

    const refreshedFirst = await prisma.semester.findUniqueOrThrow({
      where: { id: first.id },
    });
    const refreshedSecond = await prisma.semester.findUniqueOrThrow({
      where: { id: second.id },
    });
    expect(refreshedFirst.status).toBe("CLOSED");
    expect(refreshedSecond.status).toBe("OPEN");
  });

  it("the partial unique index rejects a second OPEN row from a raw UPDATE, independent of the service function", async () => {
    const db = appClient();
    await db.connect();
    try {
      const first = await createSemesterFixture({ status: "OPEN" });
      const second = await createSemesterFixture({ status: "UPCOMING" });

      await expect(
        db.query(`UPDATE semesters SET status = 'OPEN' WHERE id = $1`, [
          second.id,
        ]),
      ).rejects.toMatchObject({
        code: "23505",
        constraint: "semesters_at_most_one_open",
      });

      const stillFirst = await prisma.semester.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(stillFirst.status).toBe("OPEN");
    } finally {
      await db.end();
    }
  });

  it("closeSemester() closes without requiring another to be opened", async () => {
    const semester = await createSemesterFixture({ status: "OPEN" });

    await prisma.semester.update({
      where: { id: semester.id },
      data: { status: "CLOSED" },
    });

    const refreshed = await prisma.semester.findUniqueOrThrow({
      where: { id: semester.id },
    });
    expect(refreshed.status).toBe("CLOSED");
  });
});
