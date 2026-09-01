import { z } from "zod";

/**
 * M14: staff account creation (`POST /api/admin/users`) — §2.6's "create
 * and deactivate user accounts" and the `users.manage` capability's own
 * name, neither of which any prior module actually wired to a route.
 * Deliberately excludes STUDENT: roster import (M03) is the dedicated,
 * more complete student-creation path (it also creates the linked
 * `Student` row — registrationNumber, admissionSemesterId — that this
 * generic route has no way to collect), so this route only ever creates
 * the four staff roles.
 */
export const STAFF_ROLES = ["FOCAL", "HOD", "DEAN", "ADMIN"] as const;

// D-127: department scoping — meaningful for FOCAL/HOD only, but the
// field is accepted for any role set rather than conditionally
// required, matching how loosely `roles` itself is validated (no
// cross-field rule tying "roles includes FOCAL/HOD" to "departments
// non-empty"; an Admin who forgets simply creates an account that
// sees nothing until corrected, the same fail-closed default
// `requireDepartmentAccess()` applies everywhere else).
export const DEPARTMENTS = ["CS", "SE", "AI", "MBC"] as const;

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roles: z.array(z.enum(STAFF_ROLES)).min(1),
  fullName: z.string().trim().min(1).max(200).optional(),
  departments: z.array(z.enum(DEPARTMENTS)).optional(),
});

/**
 * `setUserRoles()`'s own schema — an *existing* account picking up (or
 * dropping) a role, e.g. a Focal Person who's now also the HoD.
 * Replace-all, same `.min(1)` floor as creation: an Admin wanting to
 * remove every staff role from someone uses deactivation instead,
 * which is the real "this account shouldn't work anymore" mechanism —
 * an account with zero roles just sits in an odd in-between state
 * this codebase has no other reason to support.
 */
export const updateUserRolesSchema = z.object({
  roles: z.array(z.enum(STAFF_ROLES)).min(1),
});
