import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PrismaClient, type RoleName, type SemesterType } from "@prisma/client";

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
  startsOn: string;
  endsOn: string;
};

const SEMESTERS: SemesterFixture[] = [
  {
    key: "fall2024",
    type: "FALL",
    year: 2024,
    startsOn: "2024-09-01",
    endsOn: "2024-12-31",
  },
  {
    key: "spring2025",
    type: "SPRING",
    year: 2025,
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
