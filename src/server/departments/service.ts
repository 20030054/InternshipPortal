import type { Department } from "@prisma/client";
import { prisma } from "@/server/db/client";

/**
 * Admin's own department-assignment mechanism for Focal Persons and
 * HoDs — see `prisma/schema.prisma`'s `UserDepartment` doc comment and
 * `docs/DECISIONS.md` D-127.
 */

/** Replace-all semantics, not incremental add/remove — matches the
 * checkbox-group UI this backs (`CreateUserForm`/`AdminUsersTable`):
 * whatever's checked when the form submits is the complete, exact set
 * afterward, the same way `UserRole` assignment already works. */
export async function setUserDepartments(
  userId: string,
  departments: readonly Department[],
): Promise<void> {
  await prisma.$transaction([
    prisma.userDepartment.deleteMany({ where: { userId } }),
    prisma.userDepartment.createMany({
      data: departments.map((department) => ({ userId, department })),
    }),
  ]);
}

export async function getUserDepartments(userId: string): Promise<Department[]> {
  const rows = await prisma.userDepartment.findMany({
    where: { userId },
    select: { department: true },
  });
  return rows.map((r) => r.department);
}
