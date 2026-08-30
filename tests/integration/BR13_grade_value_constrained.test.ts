import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createCase, createStudent, createUser } from "./support/fixtures";

describe("BR-13: grades are exactly P or I", () => {
  const db = appClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("rejects a grade value outside P/I", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "GRADE_RECOMMENDED");
    const recommender = await createUser(db);
    const awarder = await createUser(db);

    await expect(
      db.query(
        `INSERT INTO grades (id, case_id, value, recommended_by, awarded_by)
         VALUES (gen_random_uuid(), $1, 'X', $2, $3)`,
        [caseId, recommender, awarder],
      ),
    ).rejects.toThrow(/invalid input value for enum "GradeValue"/);
  });

  it("accepts P and I", async () => {
    for (const value of ["P", "I"]) {
      const studentId = await createStudent(db);
      const caseId = await createCase(db, studentId, "GRADE_RECOMMENDED");
      const recommender = await createUser(db);
      const awarder = await createUser(db);

      await expect(
        db.query(
          `INSERT INTO grades (id, case_id, value, recommended_by, awarded_by)
           VALUES (gen_random_uuid(), $1, $2::"GradeValue", $3, $4)`,
          [caseId, value, recommender, awarder],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    }
  });
});
