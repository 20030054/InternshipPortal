import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import type {
  CaseState,
  RoleName,
  SemesterStatus,
  SemesterType,
} from "@prisma/client";

/**
 * Fixture builders using the app's own Prisma client (the scit_app
 * runtime role, same instance the routes under test import) rather than
 * the raw-SQL helpers in tests/integration/support/fixtures.ts — those
 * exist to probe constraints directly; these exist to set up realistic
 * data for route-handler tests to exercise.
 */

export async function createUserFixture(overrides: { email?: string } = {}) {
  return prisma.user.create({
    data: { email: overrides.email ?? `${randomUUID()}@example.test` },
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
  const year = overrides.year ?? 2100 + Math.floor(Math.random() * 100000);
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
 * same already-enforced uniqueness needs no new coordination.
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
        year: 2000 + startSequence + i,
        status: "CLOSED",
      }),
    );
  }
  return semesters;
}

export async function createStudentFixture(
  overrides: { userId?: string; admissionSemesterId?: string } = {},
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
}
