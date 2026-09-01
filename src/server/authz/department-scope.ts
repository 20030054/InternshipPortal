import type { Department } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { CurrentIdentity } from "./require-capability";

/**
 * Department-scoped access, answered by the user (post-master-prompt,
 * M15): a Focal Person or HoD may only see and act on students in a
 * department Admin has actually assigned them to — see
 * `prisma/schema.prisma`'s `Department`/`UserDepartment` doc comments
 * and `docs/DECISIONS.md` D-127 for the full reasoning.
 *
 * Deliberately a *second*, additive check called after
 * `requireCapability()`, not folded into the capability matrix itself
 * — `rolesGrantCapability()` answers "can this role ever do X," a
 * question with a fixed, role-shaped answer; this answers "can *this*
 * account do X *to this specific student*," which needs a database
 * lookup `matrix.ts`'s own pure, I/O-free design deliberately can't
 * do. Same reason `case.view_own` needs its own ownership query on
 * top of the capability check — this is that same shape, one level
 * up (department membership instead of the account's own case).
 *
 * Thrown as a distinct error, not folded into `ForbiddenError`, so
 * every route maps it to a genuine 404 — same "an out-of-scope
 * resource doesn't even reveal it exists" privacy stance every
 * existing ownership check in this codebase already takes (D-004/§9),
 * not a 403 that would confirm to a CS-only Focal Person that a
 * specific SE case exists at all.
 */
export class DepartmentAccessDeniedError extends Error {
  constructor() {
    super("This account is not assigned to this student's department.");
    this.name = "DepartmentAccessDeniedError";
  }
}

const SCOPED_ROLES = ["FOCAL", "HOD"] as const;
const BYPASS_ROLES = ["DEAN", "ADMIN"] as const;

/**
 * Throws `DepartmentAccessDeniedError` if `identity` holds FOCAL or
 * HOD and isn't assigned to the given student's department (including
 * when the student has no department set at all — fail closed, an
 * unassigned student belongs to nobody yet). A no-op for DEAN/ADMIN
 * (checked first: a user holding both, e.g. Dean *and* Focal, is never
 * restricted) and for STUDENT-only identities, which this check was
 * never meant to gate — `case.view_own` already does that.
 */
export async function requireDepartmentAccess(
  identity: NonNullable<CurrentIdentity>,
  studentId: string,
): Promise<void> {
  if (identity.roles.some((r) => BYPASS_ROLES.includes(r as (typeof BYPASS_ROLES)[number]))) {
    return;
  }
  if (!identity.roles.some((r) => SCOPED_ROLES.includes(r as (typeof SCOPED_ROLES)[number]))) {
    return;
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { department: true },
  });
  if (!student?.department) {
    throw new DepartmentAccessDeniedError();
  }

  const assignment = await prisma.userDepartment.findUnique({
    where: { userId_department: { userId: identity.userId, department: student.department } },
  });
  if (!assignment) {
    throw new DepartmentAccessDeniedError();
  }
}

/**
 * The list-query counterpart to `requireDepartmentAccess()` — for
 * routes/dashboards returning *many* cases/students at once
 * (`GET /api/cases`, the Focal work queue, the HoD dashboard), where a
 * one-at-a-time check per row would mean fetching everything first
 * anyway. Returns `null` for DEAN/ADMIN or a non-FOCAL/HOD identity
 * (meaning: no department filter, don't restrict the query at all —
 * the caller adds a `student: { department: { in: departments } } }`
 * clause only when this returns a real array, which may be empty (an
 * account assigned to zero departments genuinely sees zero cases, the
 * same fail-closed default `requireDepartmentAccess()` applies
 * one-at-a-time).
 */
export async function allowedDepartmentsFor(
  identity: NonNullable<CurrentIdentity>,
): Promise<readonly Department[] | null> {
  if (identity.roles.some((r) => BYPASS_ROLES.includes(r as (typeof BYPASS_ROLES)[number]))) {
    return null;
  }
  if (!identity.roles.some((r) => SCOPED_ROLES.includes(r as (typeof SCOPED_ROLES)[number]))) {
    return null;
  }

  const rows = await prisma.userDepartment.findMany({
    where: { userId: identity.userId },
    select: { department: true },
  });
  return rows.map((r) => r.department);
}
