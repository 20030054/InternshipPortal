import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createCase, createStudent } from "./support/fixtures";

describe("BR-06: at most one non-terminal case per student", () => {
  const db = appClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("rejects a second non-terminal case for the same student", async () => {
    const studentId = await createStudent(db);
    await createCase(db, studentId, "ELIGIBILITY_PENDING");

    await expect(createCase(db, studentId, "ELIGIBLE")).rejects.toMatchObject(
      { code: "23505", constraint: "cases_one_nonterminal_per_student" },
    );
  });

  it("allows a second case once the first has reached a terminal state", async () => {
    const studentId = await createStudent(db);
    await createCase(db, studentId, "CLOSED_INCOMPLETE");

    await expect(
      createCase(db, studentId, "ELIGIBLE"),
    ).resolves.toBeTypeOf("string");
  });

  it("allows two different students to each hold a non-terminal case", async () => {
    const studentA = await createStudent(db);
    const studentB = await createStudent(db);

    await expect(
      createCase(db, studentA, "ELIGIBLE"),
    ).resolves.toBeTypeOf("string");
    await expect(
      createCase(db, studentB, "ELIGIBLE"),
    ).resolves.toBeTypeOf("string");
  });
});
