import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import type {
  CaseState,
  Department,
  RoleName,
  SemesterStatus,
  SemesterType,
} from "@prisma/client";

/**
 * D-127's default department for every fixture that doesn't say
 * otherwise — chosen once so `createStudentFixture()` and
 * `assignRole()`'s own FOCAL/HOD auto-assignment always agree, keeping
 * the ~50 pre-existing test files that predate department scoping
 * working completely unmodified. Tests that specifically exercise
 * cross-department isolation call `assignDepartments()` explicitly
 * with a *different* department (e.g. "SE") to prove it.
 */
const DEFAULT_TEST_DEPARTMENT: Department = "CS";

/**
 * Fixture builders using the app's own Prisma client (the scit_app
 * runtime role, same instance the routes under test import) rather than
 * the raw-SQL helpers in tests/integration/support/fixtures.ts — those
 * exist to probe constraints directly; these exist to set up realistic
 * data for route-handler tests to exercise.
 */

export async function createUserFixture(
  overrides: { email?: string; fullName?: string } = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${randomUUID()}@example.test`,
      fullName: overrides.fullName,
    },
  });
}

export async function createSemesterFixture(
  overrides: {
    type?: SemesterType;
    year?: number;
    sequenceNumber?: number;
    status?: SemesterStatus;
  } = {},
) {
  // `type` defaults to FALL below for nearly every caller in this suite
  // that doesn't care what semester it gets — collapsing the real
  // (type, year) collision space down to just this one type's years.
  // At this suite's volume (many hundreds of default-semester creations
  // across the full run), a 100,000-wide year range had a real,
  // non-negligible birthday-paradox collision chance — hit for real
  // while building M07. Widened 1000x; see docs/DECISIONS.md.
  const year = overrides.year ?? 2100 + Math.floor(Math.random() * 100_000_000);
  const sequenceNumber =
    overrides.sequenceNumber ?? 100_000 + Math.floor(Math.random() * 900_000);
  return prisma.semester.create({
    data: {
      type: overrides.type ?? "FALL",
      year,
      sequenceNumber,
      status: overrides.status ?? "UPCOMING",
      startsOn: new Date("2024-09-01"),
      endsOn: new Date("2024-12-31"),
    },
  });
}

/**
 * Creates `count` consecutive CLOSED semesters (sequence numbers
 * `startSequence`, `startSequence + 1`, ...) — the shape
 * BR02_auto_enrollment_sweep.test.ts and eligibility tests need to put a
 * student a specific number of completed semesters past admission.
 *
 * Also passes an explicit `year` derived from `startSequence` (rather
 * than leaving `createSemesterFixture`'s own default random year in
 * play): that default only draws from a 100,000-wide space and always
 * defaults `type` to `FALL` too, so a suite creating many chains (M05's
 * offer/eligibility fixtures added a few dozen) has real birthday-paradox
 * odds of two chains colliding on `(type, year)` — hit exactly once
 * while building M05. Since callers already keep `startSequence` blocks
 * disjoint by convention (every semester-creating test file in this
 * suite reserves its own numeric block), piggybacking `year` on that
 * same already-enforced uniqueness needs no new coordination — but the
 * offset has to be large enough to clear every hand-written manual year
 * elsewhere in the suite too (e.g. BR01_eligibility_is_computed_not_
 * stored.test.ts's own `5100 + random(0, 1000)`), not just other
 * `createClosedSemesterChain` callers: a first attempt at this offset
 * (+2000) put M05's fixtures' years at 6000-6003, inside that exact
 * random range, and got hit for real while building M07. +1,000,000
 * clears every existing range with room to spare.
 */
export async function createClosedSemesterChain(
  count: number,
  startSequence: number,
) {
  const semesters = [];
  for (let i = 0; i < count; i++) {
    semesters.push(
      await createSemesterFixture({
        sequenceNumber: startSequence + i,
        year: 1_000_000 + startSequence + i,
        status: "CLOSED",
      }),
    );
  }
  return semesters;
}

export async function createStudentFixture(
  overrides: {
    userId?: string;
    admissionSemesterId?: string;
    department?: Department | null;
  } = {},
) {
  const userId = overrides.userId ?? (await createUserFixture()).id;
  const admissionSemesterId =
    overrides.admissionSemesterId ?? (await createSemesterFixture()).id;
  return prisma.student.create({
    data: {
      userId,
      registrationNumber: `TEST-${randomUUID()}`,
      admissionSemesterId,
      programme: "BS Computer Science",
      // D-127: defaults to CS, not null -- an unassigned student is
      // invisible to every Focal/HoD fixture (fail closed), which
      // would silently break the ~50 pre-existing tests that predate
      // department scoping and never opted into it. Pass
      // `department: null` explicitly for a test that specifically
      // wants an unassigned student.
      department: overrides.department === undefined ? DEFAULT_TEST_DEPARTMENT : overrides.department,
    },
  });
}

/**
 * Creates a case directly at whatever `state` a test needs — bypassing
 * the question of how it normally gets there (M04's fixtures don't need
 * to answer OQ-11; that's a separate concern from "does this transition
 * work given a case already sitting at its `from` state").
 */
export async function createCaseFixture(
  overrides: {
    studentId?: string;
    state?: CaseState;
    companyId?: string;
    previousCaseId?: string;
    autoEnrolled?: boolean;
    plannedStart?: Date;
    plannedEnd?: Date;
    actualStart?: Date;
    actualEnd?: Date;
  } = {},
) {
  const studentId = overrides.studentId ?? (await createStudentFixture()).id;
  return prisma.case.create({
    data: {
      studentId,
      state: overrides.state ?? "ELIGIBILITY_PENDING",
      companyId: overrides.companyId,
      previousCaseId: overrides.previousCaseId,
      autoEnrolled: overrides.autoEnrolled ?? false,
      plannedStart: overrides.plannedStart,
      plannedEnd: overrides.plannedEnd,
      actualStart: overrides.actualStart,
      actualEnd: overrides.actualEnd,
    },
  });
}

export async function createCompanyFixture(
  overrides: { name?: string } = {},
) {
  const name = overrides.name ?? `Company ${randomUUID()}`;
  return prisma.company.create({
    data: { name, normalisedName: name.trim().toLowerCase() },
  });
}

export async function assignRole(userId: string, roleName: RoleName) {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });

  // D-127: a FOCAL/HOD fixture with zero department assignments sees
  // nothing (fail closed) -- auto-assigning the same default
  // `createStudentFixture()` uses is what keeps every pre-existing
  // test in this suite working unmodified. Only when *none* exist
  // yet, so a test that already called `assignDepartments()` first
  // (or will call it after, since that's replace-all) is never
  // silently overridden here.
  if (roleName === "FOCAL" || roleName === "HOD") {
    const existing = await prisma.userDepartment.findFirst({ where: { userId } });
    if (!existing) {
      await prisma.userDepartment.create({
        data: { userId, department: DEFAULT_TEST_DEPARTMENT },
      });
    }
  }
}

/** Explicit override for tests proving cross-department isolation —
 * replace-all, same semantics as the real `setUserDepartments()`
 * (`src/server/departments/service.ts`) this mirrors. Call *after*
 * `assignRole()` if the goal is to override its own CS default (an
 * empty array is valid and meaningful: it un-assigns entirely). */
export async function assignDepartments(userId: string, departments: readonly Department[]) {
  await prisma.$transaction([
    prisma.userDepartment.deleteMany({ where: { userId } }),
    prisma.userDepartment.createMany({
      data: departments.map((department) => ({ userId, department })),
    }),
  ]);
}
