import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createStudent, createUser } from "./support/fixtures";

const LONG_ENOUGH_CIRCUMSTANCE = "x".repeat(300);
const TOO_SHORT_CIRCUMSTANCE = "x".repeat(299);

describe("BR-23: at most one waiver per student, ever", () => {
  const db = appClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  async function insertWaiver(
    studentId: string,
    circumstance: string,
  ): Promise<void> {
    const focalSigner = await createUser(db);
    await db.query(
      `INSERT INTO waivers (id, student_id, circumstance, focal_signer_id, focal_reason, focal_signed_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'exceptional circumstance', now())`,
      [studentId, circumstance, focalSigner],
    );
  }

  it("rejects a second waiver for the same student", async () => {
    const studentId = await createStudent(db);
    await insertWaiver(studentId, LONG_ENOUGH_CIRCUMSTANCE);

    await expect(
      insertWaiver(studentId, LONG_ENOUGH_CIRCUMSTANCE),
    ).rejects.toMatchObject({ code: "23505", constraint: "waivers_student_id_key" });
  });

  it("rejects a circumstance narrative under 300 characters", async () => {
    const studentId = await createStudent(db);
    await expect(
      insertWaiver(studentId, TOO_SHORT_CIRCUMSTANCE),
    ).rejects.toMatchObject({
      code: "23514", // check_violation
      constraint: "waivers_circumstance_min_length",
    });
  });

  it("allows different students to each hold their own waiver", async () => {
    const studentA = await createStudent(db);
    const studentB = await createStudent(db);
    await expect(
      insertWaiver(studentA, LONG_ENOUGH_CIRCUMSTANCE),
    ).resolves.toBeUndefined();
    await expect(
      insertWaiver(studentB, LONG_ENOUGH_CIRCUMSTANCE),
    ).resolves.toBeUndefined();
  });
});
