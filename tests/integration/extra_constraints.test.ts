import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createCase, createStudent, createUser } from "./support/fixtures";

/**
 * Covers the defence-in-depth mechanisms called out in
 * prisma/migrations/*_init/migration.sql that aren't one of M01's named
 * BR-xx tests on their own (they back BR-12, BR-17 G3/G5, and the
 * "documents are never deleted" rule from §9 "Files") — the service layer
 * is the primary authority for all of these; this proves the database
 * floor under it actually holds.
 */
describe("extra schema-level defence-in-depth constraints", () => {
  const db = appClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("rejects a document moving from SUPERSEDED back to ACTIVE", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "DOCS_PENDING");
    const uploader = await createUser(db);
    const docId = crypto.randomUUID();

    await db.query(
      `INSERT INTO documents (id, case_id, type, storage_key, original_filename, checksum_sha256, status, uploaded_by)
       VALUES ($1, $2, 'OFFER_LETTER', $3, 'offer.pdf', 'deadbeef', 'ACTIVE', $4)`,
      [docId, caseId, `storage-${docId}`, uploader],
    );

    await db.query(`UPDATE documents SET status = 'SUPERSEDED' WHERE id = $1`, [
      docId,
    ]);

    await expect(
      db.query(`UPDATE documents SET status = 'ACTIVE' WHERE id = $1`, [
        docId,
      ]),
    ).rejects.toThrow(/cannot move from SUPERSEDED back to ACTIVE/);
  });

  it("rejects a grade whose recommender and awarder are the same account (BR-12)", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "GRADE_RECOMMENDED");
    const sameUser = await createUser(db);

    await expect(
      db.query(
        `INSERT INTO grades (id, case_id, value, recommended_by, awarded_by)
         VALUES (gen_random_uuid(), $1, 'P', $2, $2)`,
        [caseId, sameUser],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "grades_recommender_not_awarder",
    });
  });

  it("rejects a restart request whose focal and HoD signer are the same account (BR-17 G3/G5)", async () => {
    const failedStudentId = await createStudent(db);
    const failedCase = await createCase(db, failedStudentId, "CLOSED_INCOMPLETE");
    const company = crypto.randomUUID();
    await db.query(
      `INSERT INTO companies (id, name, normalised_name) VALUES ($1, 'Acme', 'acme')`,
      [company],
    );
    const sameUser = await createUser(db);

    await expect(
      db.query(
        `INSERT INTO restart_requests
           (id, failed_case_id, new_company_id, g1_result, g2_result,
            focal_signer_id, focal_reason, focal_signed_at,
            hod_signer_id, hod_reason, hod_signed_at,
            restart_cap_at_request)
         VALUES
           (gen_random_uuid(), $1, $2, '{}', '{}',
            $3, 'different org, time remains', now(),
            $3, 'countersigned', now(),
            1)`,
        [failedCase, company, sameUser],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "restart_requests_focal_not_hod",
    });
  });

  it("allows at most one live supervisor token per case", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "DOCS_PENDING");

    await db.query(
      `INSERT INTO supervisor_tokens (id, case_id, token_hash, expires_at)
       VALUES (gen_random_uuid(), $1, $2, now() + interval '21 days')`,
      [caseId, `hash-${crypto.randomUUID()}`],
    );

    await expect(
      db.query(
        `INSERT INTO supervisor_tokens (id, case_id, token_hash, expires_at)
         VALUES (gen_random_uuid(), $1, $2, now() + interval '21 days')`,
        [caseId, `hash-${crypto.randomUUID()}`],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "supervisor_tokens_one_live_per_case",
    });
  });

  it("allows a replacement token once the prior one is revoked", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "DOCS_PENDING");
    const firstId = crypto.randomUUID();

    await db.query(
      `INSERT INTO supervisor_tokens (id, case_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '21 days')`,
      [firstId, caseId, `hash-${crypto.randomUUID()}`],
    );
    await db.query(
      `UPDATE supervisor_tokens SET revoked_at = now() WHERE id = $1`,
      [firstId],
    );

    await expect(
      db.query(
        `INSERT INTO supervisor_tokens (id, case_id, token_hash, expires_at)
         VALUES (gen_random_uuid(), $1, $2, now() + interval '21 days')`,
        [caseId, `hash-${crypto.randomUUID()}`],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});
