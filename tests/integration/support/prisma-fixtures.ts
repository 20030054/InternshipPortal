import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import type { RoleName, SemesterStatus, SemesterType } from "@prisma/client";

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
