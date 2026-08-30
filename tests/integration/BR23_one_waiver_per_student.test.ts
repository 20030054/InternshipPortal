import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createStudent, createUser } from "./support/fixtures";
import { createPendingWaiver } from "./support/waiver-fixtures";
import { initiateWaiver, AlreadyHasWaiverError } from "@/server/waivers/service";
import { validPdfFile } from "./support/files";
import { VALID_CIRCUMSTANCE } from "./support/waiver-fixtures";
import { prisma } from "@/server/db/client";

const LONG_ENOUGH_CIRCUMSTANCE = "x".repeat(300);
const TOO_SHORT_CIRCUMSTANCE = "x".repeat(299);

/**
 * BR-23: at most one waiver per student, ever — even a DENIED one blocks
 * any future attempt, since `waivers.student_id` is an unconditional
 * unique constraint (not partial like `cases_one_nonterminal_per_student`).
 *
 * The first describe block below predates M11's service/route layer
 * (M01, raw SQL against the bare constraints — no app code existed yet)
 * and is kept as-is: it's the more direct proof that the DB-level
 * guarantee holds regardless of what any future service code does. The
 * second describe block is M11's own, against the real `initiateWaiver()`
 * service and route.
 */
describe("BR-23 (M01): raw SQL against the bare constraints", () => {
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

describe("BR-23 (M11): the real service and Prisma layer", () => {
  it("a second initiate attempt for the same student is rejected by the service's own pre-check", async () => {
    const first = await createPendingWaiver();

    await expect(
      initiateWaiver({
        studentId: first.studentId,
        actor: { userId: first.focalUserId, roles: ["FOCAL"] },
        circumstance: VALID_CIRCUMSTANCE,
        reason: "trying again",
        evidenceFile: validPdfFile(),
      }),
    ).rejects.toBeInstanceOf(AlreadyHasWaiverError);
  });

  it("the database itself rejects a second waivers row for the same student_id, unconditionally", async () => {
    const first = await createPendingWaiver();

    await expect(
      prisma.waiver.create({
        data: {
          studentId: first.studentId,
          circumstance: VALID_CIRCUMSTANCE,
          focalSignerId: first.focalUserId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
