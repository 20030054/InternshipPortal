import { prisma } from "@/server/db/client";

/**
 * M15: `/admin`'s own data — Admin had no dedicated screen at all
 * (M13's own scope decision, D-082) until this one, which just gives
 * an ADMIN-role login somewhere real to land instead of bouncing back
 * to `/login` (see `src/app/page.tsx`'s own comment on that). Staff
 * accounts only — `users.manage`'s own creation route
 * (`src/server/users/service.ts`) never creates a STUDENT this way
 * either (roster import is that path), so this list doesn't need to
 * scale to the whole student body.
 */
export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  roles: string[];
  departments: string[];
  disabledAt: Date | null;
  createdAt: Date;
};

export async function listStaffUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    where: {
      roleAssignments: { some: { role: { name: { in: ["FOCAL", "HOD", "DEAN", "ADMIN"] } } } },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      disabledAt: true,
      createdAt: true,
      roleAssignments: { select: { role: { select: { name: true } } } },
      departmentAssignments: { select: { department: true } },
    },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roleAssignments.map((assignment) => assignment.role.name),
    departments: user.departmentAssignments.map((a) => a.department),
    disabledAt: user.disabledAt,
    createdAt: user.createdAt,
  }));
}
