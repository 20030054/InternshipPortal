import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main as seed } from "../../prisma/seed";
import { migrationClient } from "./support/db";

describe("prisma/seed.ts", () => {
  const db = migrationClient();

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it("runs twice without erroring or duplicating rows", async () => {
    await expect(seed()).resolves.toBeUndefined();
    const first = await countSeededRows(db);

    await expect(seed()).resolves.toBeUndefined();
    const second = await countSeededRows(db);

    expect(second).toEqual(first);
    expect(first.roles).toBe(5);
  });
});

async function countSeededRows(db: ReturnType<typeof migrationClient>) {
  // Sequential, not Promise.all: a single pg.Client processes one query at
  // a time — concurrent calls on it are a deprecated pattern in node-pg.
  const roles = await db.query("SELECT count(*)::int AS n FROM roles");
  const students = await db.query(
    "SELECT count(*)::int AS n FROM students WHERE registration_number LIKE 'FA22-%' OR registration_number LIKE 'SP23-%'",
  );
  const users = await db.query(
    "SELECT count(*)::int AS n FROM users WHERE email LIKE '%@example.scit.test'",
  );
  return {
    roles: roles.rows[0].n as number,
    students: students.rows[0].n as number,
    users: users.rows[0].n as number,
  };
}
