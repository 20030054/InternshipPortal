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

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roles: z.array(z.enum(STAFF_ROLES)).min(1),
  fullName: z.string().trim().min(1).max(200).optional(),
});
