import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createCase, createStudent, createUser } from "./support/fixtures";

/**
 * Proves BR-14 as the runtime role actually experiences it: scit_app can
 * INSERT a grade (grading is something the app does), but once written it
 * cannot UPDATE or DELETE that row — the privilege was revoked in the
 * init migration, not merely omitted from the app's routes.
 */
describe("BR-14: grades are immutable at the database privilege level", () => {
  const db = appClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  async function insertGrade(): Promise<string> {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "GRADE_RECOMMENDED");
    const recommender = await createUser(db);
    const awarder = await createUser(db);
    const gradeId = crypto.randomUUID();

    await db.query(
      `INSERT INTO grades (id, case_id, value, recommended_by, awarded_by)
       VALUES ($1, $2, 'P', $3, $4)`,
      [gradeId, caseId, recommender, awarder],
    );
    return gradeId;
  }

  it("allows the runtime role to insert a grade", async () => {
    await expect(insertGrade()).resolves.toBeTypeOf("string");
  });

  it("rejects UPDATE on grades even for the row's own values", async () => {
    const gradeId = await insertGrade();
    await expect(
      db.query(`UPDATE grades SET value = 'I' WHERE id = $1`, [gradeId]),
    ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege
  });

  it("rejects DELETE on grades", async () => {
    const gradeId = await insertGrade();
    await expect(
      db.query(`DELETE FROM grades WHERE id = $1`, [gradeId]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("still allows SELECT", async () => {
    const gradeId = await insertGrade();
    const { rows } = await db.query(`SELECT id FROM grades WHERE id = $1`, [
      gradeId,
    ]);
    expect(rows).toHaveLength(1);
  });
});
