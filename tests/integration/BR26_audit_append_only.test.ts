import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appClient } from "./support/db";
import { createCase, createStudent, createUser } from "./support/fixtures";

/**
 * BR-26: every audit_events / case_events row, once written, is
 * append-only — the runtime role has INSERT + SELECT and nothing else.
 */
describe("BR-26: audit_events and case_events are append-only at the privilege level", () => {
  const db = appClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  describe("audit_events", () => {
    async function insertAuditEvent(): Promise<string> {
      const actor = await createUser(db);
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO audit_events (id, actor_user_id, event_type, entity_type, entity_id)
         VALUES ($1, $2, 'TEST_EVENT', 'case', gen_random_uuid())`,
        [id, actor],
      );
      return id;
    }

    it("allows INSERT", async () => {
      await expect(insertAuditEvent()).resolves.toBeTypeOf("string");
    });

    it("rejects UPDATE", async () => {
      const id = await insertAuditEvent();
      await expect(
        db.query(`UPDATE audit_events SET event_type = 'X' WHERE id = $1`, [
          id,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("rejects DELETE", async () => {
      const id = await insertAuditEvent();
      await expect(
        db.query(`DELETE FROM audit_events WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  describe("case_events", () => {
    async function insertCaseEvent(): Promise<string> {
      const studentId = await createStudent(db);
      const caseId = await createCase(db, studentId, "ELIGIBILITY_PENDING");
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO case_events (id, case_id, from_state, to_state, reason)
         VALUES ($1, $2, 'ELIGIBILITY_PENDING', 'ELIGIBLE', 'test')`,
        [id, caseId],
      );
      return id;
    }

    it("allows INSERT", async () => {
      await expect(insertCaseEvent()).resolves.toBeTypeOf("string");
    });

    it("rejects UPDATE", async () => {
      const id = await insertCaseEvent();
      await expect(
        db.query(`UPDATE case_events SET reason = 'X' WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("rejects DELETE", async () => {
      const id = await insertCaseEvent();
      await expect(
        db.query(`DELETE FROM case_events WHERE id = $1`, [id]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});
