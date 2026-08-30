import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createCase, createStudent } from "./support/fixtures";

/**
 * BR-25 / MASTER_PROMPT.md §5.2: cases.state is writable only by the
 * transition executor, which (once M04 exists) will run its UPDATE inside
 * a transaction that first sets the app.transition_authorized session-local
 * flag. Until then, nothing in this codebase sets that flag, so a raw
 * UPDATE — which is all any current code path can do — must always fail.
 */
describe("BR-25: cases.state is writable only via the authorized-transaction flag", () => {
  const db = appClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterEach(async () => {
    // In case a test left an open transaction behind on failure.
    await db.query("ROLLBACK").catch(() => {});
  });

  afterAll(async () => {
    await db.end();
  });

  it("rejects a direct UPDATE outside an authorized transaction", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "ELIGIBILITY_PENDING");

    await expect(
      db.query(`UPDATE cases SET state = 'ELIGIBLE' WHERE id = $1`, [
        caseId,
      ]),
    ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege

    const { rows } = await db.query(`SELECT state FROM cases WHERE id = $1`, [
      caseId,
    ]);
    expect(rows[0].state).toBe("ELIGIBILITY_PENDING");
  });

  it("accepts the UPDATE once the session-local flag is set", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "ELIGIBILITY_PENDING");

    await db.query("BEGIN");
    await db.query("SET LOCAL app.transition_authorized = 'true'");
    await db.query(`UPDATE cases SET state = 'ELIGIBLE' WHERE id = $1`, [
      caseId,
    ]);
    await db.query("COMMIT");

    const { rows } = await db.query(`SELECT state FROM cases WHERE id = $1`, [
      caseId,
    ]);
    expect(rows[0].state).toBe("ELIGIBLE");
  });

  it("does not leak the authorized flag into the next transaction", async () => {
    const studentId = await createStudent(db);
    const caseId = await createCase(db, studentId, "ELIGIBILITY_PENDING");

    // Authorize and commit one transition.
    await db.query("BEGIN");
    await db.query("SET LOCAL app.transition_authorized = 'true'");
    await db.query(`UPDATE cases SET state = 'ELIGIBLE' WHERE id = $1`, [
      caseId,
    ]);
    await db.query("COMMIT");

    // SET LOCAL is scoped to the transaction that set it — a fresh
    // transaction on the same connection must start unauthorized again.
    await expect(
      db.query(`UPDATE cases SET state = 'OFFER_SUBMITTED' WHERE id = $1`, [
        caseId,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
