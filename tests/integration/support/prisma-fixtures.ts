import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import type { RoleName } from "@prisma/client";

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

export async function createSemesterFixture() {
  const year = 2100 + Math.floor(Math.random() * 100000);
  return prisma.semester.create({
    data: {
      type: "FALL",
      year,
      startsOn: new Date("2024-09-01"),
      endsOn: new Date("2024-12-31"),
    },
  });
}

export async function createStudentFixture(overrides: { userId?: string } = {}) {
  const userId = overrides.userId ?? (await createUserFixture()).id;
  const semester = await createSemesterFixture();
  return prisma.student.create({
    data: {
      userId,
      registrationNumber: `TEST-${randomUUID()}`,
      admissionSemesterId: semester.id,
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
