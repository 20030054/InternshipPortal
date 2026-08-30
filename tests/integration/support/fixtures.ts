import { randomUUID } from "node:crypto";
import type { Client } from "pg";

/**
 * Minimal fixture builders shared by the constraint/privilege integration
 * tests. All use randomUUID() (v4) rather than Prisma's uuid(7) — fine for
 * a foreign-key target in a test, since Postgres doesn't care which UUID
 * version a column holds. Every insert uses a fresh random value, so tests
 * never collide with each other or with prisma/seed.ts's fixed fixtures,
 * even sharing one database (see vitest.integration.config.ts's
 * fileParallelism: false, which keeps concurrent *files* from racing).
 */

export async function createUser(db: Client): Promise<string> {
  const id = randomUUID();
  await db.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
    id,
    `${id}@example.test`,
  ]);
  return id;
}

export async function createSemester(db: Client): Promise<string> {
  const id = randomUUID();
  // A random year keeps the (type, year) unique constraint from colliding
  // across test runs/files without needing a shared counter.
  const year = 2100 + Math.floor(Math.random() * 100000);
  await db.query(
    `INSERT INTO semesters (id, type, year, starts_on, ends_on)
     VALUES ($1, 'FALL', $2, '2024-09-01', '2024-12-31')`,
    [id, year],
  );
  return id;
}

export async function createStudent(
  db: Client,
  opts: { userId?: string; semesterId?: string } = {},
): Promise<string> {
  const userId = opts.userId ?? (await createUser(db));
  const semesterId = opts.semesterId ?? (await createSemester(db));
  const id = randomUUID();
  await db.query(
    `INSERT INTO students (id, user_id, registration_number, admission_semester_id, programme)
     VALUES ($1, $2, $3, $4, 'BS Computer Science')`,
    [id, userId, `TEST-${id}`, semesterId],
  );
  return id;
}

export async function createCase(
  db: Client,
  studentId: string,
  state = "ELIGIBILITY_PENDING",
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO cases (id, student_id, state, updated_at)
     VALUES ($1, $2, $3::"CaseState", now())`,
    [id, studentId, state],
  );
  return id;
}
