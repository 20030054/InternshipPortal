import { prisma } from "@/server/db/client";
import type { RoleName } from "@prisma/client";

export type Identity = {
  userId: string;
  tokenVersion: number;
  roles: RoleName[];
};

/**
 * Reads a user's current tokenVersion, disabled state, and role names
 * fresh from the database. Never trusts a cached/embedded copy — this is
 * what makes password-change and role-change session invalidation true by
 * construction (see docs/modules/M02.md "Session and JWT design") rather
 * than something every call site has to remember to check. Returns null
 * for a missing or disabled account.
 */
export async function loadIdentity(userId: string): Promise<Identity | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tokenVersion: true,
      disabledAt: true,
      roleAssignments: { select: { role: { select: { name: true } } } },
    },
  });

  if (!user || user.disabledAt) {
    return null;
  }

  return {
    userId: user.id,
    tokenVersion: user.tokenVersion,
    roles: user.roleAssignments.map((assignment) => assignment.role.name),
  };
}
