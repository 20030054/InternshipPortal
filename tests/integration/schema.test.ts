import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationClient } from "./support/db";

/**
 * Confirms the migration actually applied cleanly against whatever
 * database DATABASE_MIGRATION_ROLE points at — the other integration
 * tests all assume this. If this test fails, run
 * `pnpm exec prisma migrate deploy` against that database before
 * chasing failures in the others.
 */
describe("migration applies cleanly", () => {
  const db = migrationClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("creates every table from prisma/schema.prisma", async () => {
    const expectedTables = [
      "users",
      "roles",
      "user_roles",
      "students",
      "semesters",
      "companies",
      "cases",
      "case_events",
      "documents",
      "verifications",
      "grades",
      "grade_reversals",
      "supervisor_tokens",
      "evaluations",
      "restart_requests",
      "waivers",
      "escalations",
      "audit_events",
      "notifications",
    ];

    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const actualTables = new Set(rows.map((r) => r.table_name));

    for (const table of expectedTables) {
      expect(actualTables.has(table), `missing table: ${table}`).toBe(true);
    }
  });

  it("creates the scit_app runtime role", async () => {
    const { rows } = await db.query<{ rolname: string }>(
      `SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = 'scit_app'`,
    );
    expect(rows).toHaveLength(1);
  });
});
