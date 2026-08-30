import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  PrismaClient,
  type RoleName,
  type SemesterStatus,
  type SemesterType,
} from "@prisma/client";
// Relative, not the "@/*" alias — this file runs directly under tsx from
// outside src/, and a relative path doesn't depend on tsx's tsconfig-paths
// resolution working the same way it does under Next's bundler.
import { hashPassword } from "../src/server/auth/password";

// Deliberately minimal per docs/modules/M01.md: the five roles, one user
// per non-student role (for local dev login once M02 exists), two
// semesters, and a handful of students. The richly populated demo dataset
// (students across semesters 3-8, cases in every state, one restart, one
// waiver — MASTER_PROMPT.md §11) is M13's job, once there's a UI to see it
// in. This script only needs to give M01's own constraint tests something
// to insert against.
//
// Connects with the schema's default datasource (DATABASE_MIGRATION_ROLE)
// rather than the app's runtime-role override in src/server/db/client.ts —
// seeding is an operational/dev task, not something the running
// application does.
const prisma = new PrismaClient();

const ROLE_NAMES: RoleName[] = ["STUDENT", "FOCAL", "HOD", "DEAN", "ADMIN"];

type SemesterFixture = {
  key: string;
  type: SemesterType;
  year: number;
  sequenceNumber: number;
  status: SemesterStatus;
  startsOn: string;
  endsOn: string;
};

// M03: sequenceNumber/status are now required columns (see
// docs/modules/M03.md). fall2024 is CLOSED and spring2025 is OPEN — a
// minimal but valid "current semester" baseline. This alone isn't enough
// closed history to make any seeded student eligible (BR-01 needs 4
// closed semesters since admission); the eligibility computation itself
// is covered by dedicated fixtures in tests/unit/eligibility.test.ts,
// not by trying to manufacture an "eligible" example here.
const SEMESTERS: SemesterFixture[] = [
  {
    key: "fall2024",
    type: "FALL",
    year: 2024,
    sequenceNumber: 1,
    status: "CLOSED",
    startsOn: "2024-09-01",
    endsOn: "2024-12-31",
  },
  {
    key: "spring2025",
    type: "SPRING",
    year: 2025,
    sequenceNumber: 2,
    status: "OPEN",
    startsOn: "2025-01-15",
    endsOn: "2025-05-31",
  },
];

type StudentFixture = {
  email: string;
  registrationNumber: string;
  programme: string;
  admissionSemesterKey: string;
};

const STUDENTS: StudentFixture[] = [
  {
    email: "student1@example.scit.test",
    registrationNumber: "FA22-BSE-001",
    programme: "BS Software Engineering",
    admissionSemesterKey: "fall2024",
  },
  {
    email: "student2@example.scit.test",
    registrationNumber: "FA22-BSE-002",
    programme: "BS Software Engineering",
    admissionSemesterKey: "fall2024",
  },
  {
    email: "student3@example.scit.test",
    registrationNumber: "SP23-BSCS-001",
    programme: "BS Computer Science",
    admissionSemesterKey: "spring2025",
  },
  {
    email: "student4@example.scit.test",
    registrationNumber: "SP23-BSCS-002",
    programme: "BS Computer Science",
    admissionSemesterKey: "spring2025",
  },
  {
    email: "student5@example.scit.test",
    registrationNumber: "FA22-BSE-003",
    programme: "BS Software Engineering",
    admissionSemesterKey: "fall2024",
  },
];

const STAFF: Array<{ email: string; role: RoleName }> = [
  { email: "focal@example.scit.test", role: "FOCAL" },
  { email: "hod@example.scit.test", role: "HOD" },
  { email: "dean@example.scit.test", role: "DEAN" },
  { email: "admin@example.scit.test", role: "ADMIN" },
];

// M02: dev-only fixed password for every seeded account, so local
// development and the test suite have something to sign in with without
// a real account-creation flow existing yet (M03's roster import is what
// actually creates accounts in production). Guarded by NODE_ENV — see
// setDevPasswordIfMissing below. Never treat this as a real credential;
// it is deliberately public, in version control, on purpose.
const DEV_PASSWORD = "dev-password-not-for-prod";

/**
 * Sets a fixed dev password on a freshly upserted user, but only if
 * running outside production and only if the account doesn't already
 * have a password hash (so repeated seed runs don't re-hash argon2 on
 * every invocation). This is the *only* password-setting logic in the
 * whole seed script — there is no equivalent path when NODE_ENV is
 * "production", by design.
 */
async function setDevPasswordIfMissing(userId: string): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (user.passwordHash) return;

  const passwordHash = await hashPassword(DEV_PASSWORD);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/** Exported so tests/integration/seed.test.ts can call it directly (twice,
 * to prove idempotency) instead of shelling out to a subprocess. */
export async function main() {
  console.log("[seed] upserting roles...");
  const roleByName = new Map<RoleName, string>();
  for (const name of ROLE_NAMES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roleByName.set(name, role.id);
  }

  console.log("[seed] upserting semesters...");
  const semesterByKey = new Map<string, string>();
  for (const s of SEMESTERS) {
    const semester = await prisma.semester.upsert({
      where: { type_year: { type: s.type, year: s.year } },
      update: {},
      create: {
        type: s.type,
        year: s.year,
        sequenceNumber: s.sequenceNumber,
        status: s.status,
        startsOn: new Date(s.startsOn),
        endsOn: new Date(s.endsOn),
      },
    });
    semesterByKey.set(s.key, semester.id);
  }

  console.log("[seed] upserting staff users...");
  const studentRoleId = roleByName.get("STUDENT");
  if (!studentRoleId) {
    throw new Error("STUDENT role missing after upsert — seed is broken");
  }

  for (const staff of STAFF) {
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {},
      create: { email: staff.email },
    });
    const roleId = roleByName.get(staff.role);
    if (!roleId) {
      throw new Error(`${staff.role} role missing after upsert`);
    }
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
    await setDevPasswordIfMissing(user.id);
  }

  console.log("[seed] upserting test roster...");
  for (const s of STUDENTS) {
    const admissionSemesterId = semesterByKey.get(s.admissionSemesterKey);
    if (!admissionSemesterId) {
      throw new Error(`Unknown semester key ${s.admissionSemesterKey}`);
    }

    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: studentRoleId } },
      update: {},
      create: { userId: user.id, roleId: studentRoleId },
    });

    await prisma.student.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        registrationNumber: s.registrationNumber,
        admissionSemesterId,
        programme: s.programme,
      },
    });

    await setDevPasswordIfMissing(user.id);
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[seed] dev passwords set (NODE_ENV=${process.env.NODE_ENV ?? "unset"}) — never use this build's seeded credentials in production`,
    );
  }

  console.log(
    `[seed] done: ${ROLE_NAMES.length} roles, ${SEMESTERS.length} semesters, ${STAFF.length} staff users, ${STUDENTS.length} students`,
  );
}

// Only run automatically when executed directly (`tsx prisma/seed.ts` /
// `prisma db seed`), not when imported by a test.
const isMain =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  main()
    .catch((err: unknown) => {
      console.error("[seed] failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
