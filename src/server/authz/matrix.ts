import type { RoleName } from "@prisma/client";

/**
 * The single source of truth for "who can do what." Both the API layer
 * (requireCapability, see require-capability.ts) and — later — the UI
 * (hiding an affordance a capability check would reject anyway) read from
 * this file. Nothing else in the codebase is allowed to branch on a role
 * name directly; see CONVENTIONS.md "Naming" and DECISIONS.md D-004.
 *
 * The eighteen rows of MASTER_PROMPT.md §3 are all declared here, even
 * though most have no route to call them from until M05 through M11 exist
 * — building the matrix once, completely, means those modules configure a
 * route against an existing capability, not invent one under deadline.
 *
 * Three additional capabilities exist only to support M02's own
 * demonstration routes (`/api/me`, `/api/students/:id`) and are not part
 * of §3: `self.view`, `student.view_own`, `student.view_any`. They prove
 * the requireCapability + row-ownership pattern against the one ownable
 * resource that exists this early (Student) — see docs/modules/M02.md
 * "Scope decisions this module makes." They are not extended with
 * case-shaped behavior; M04/M05 add `case.view_own`/`case.view_any`
 * alongside them, not instead of them.
 *
 * `grade.reverse` is a nineteenth, added by M09: BR-14 requires "a Dean
 * signature" for a grade reversal, and no row in §3's table covers it —
 * a real gap in the master prompt's own table, not an invented one. See
 * docs/modules/M09.md "Scope decisions."
 */

export type Capability =
  // MASTER_PROMPT.md §3, in table order
  | "case.view_own"
  | "case.view_any"
  | "case.open"
  | "offer.approve"
  | "case.progress_log_update"
  | "document.upload_completion_certificate"
  | "supervisor_token.issue"
  | "deliverable.verify"
  | "grade.recommend"
  | "grade.award"
  // Not one of MASTER_PROMPT.md §3's eighteen rows — a real gap found
  // implementing BR-14 (M09): a grade reversal needs "a Dean signature,"
  // but no row in the table covers it. See docs/modules/M09.md.
  | "grade.reverse"
  | "restart.initiate"
  | "restart.countersign"
  | "escalation.rule_restart"
  | "waiver.initiate"
  | "waiver.countersign"
  | "waiver.approve_final"
  | "users.manage"
  | "audit.edit"
  // M02 scaffolding only — see module doc comment above
  | "self.view"
  | "student.view_own"
  | "student.view_any";

/**
 * capability -> roles allowed to hold it. An empty array (audit.edit) is
 * deliberate: MASTER_PROMPT.md §3's last row has no ✓ in any column, and
 * that must remain true at the database privilege level too (see M01's
 * REVOKE UPDATE, DELETE on audit_events — this table is the code-level
 * mirror of that same fact).
 */
export const CAPABILITY_MATRIX: Readonly<Record<Capability, readonly RoleName[]>> = {
  "case.view_own": ["STUDENT"],
  "case.view_any": ["FOCAL", "HOD", "DEAN"],
  "case.open": ["STUDENT"],
  "offer.approve": ["FOCAL"],
  "case.progress_log_update": ["STUDENT"],
  "document.upload_completion_certificate": ["STUDENT"],
  "supervisor_token.issue": ["FOCAL"],
  "deliverable.verify": ["FOCAL"],
  "grade.recommend": ["FOCAL"],
  "grade.award": ["HOD"],
  "grade.reverse": ["DEAN"],
  "restart.initiate": ["FOCAL"],
  "restart.countersign": ["HOD"],
  "escalation.rule_restart": ["DEAN"],
  "waiver.initiate": ["FOCAL"],
  "waiver.countersign": ["HOD"],
  "waiver.approve_final": ["DEAN"],
  "users.manage": ["ADMIN"],
  "audit.edit": [],

  "self.view": ["STUDENT", "FOCAL", "HOD", "DEAN", "ADMIN"],
  "student.view_own": ["STUDENT"],
  "student.view_any": ["FOCAL", "HOD", "DEAN"],
} as const;

/** True if any of the given roles is allowed to hold this capability. */
export function rolesGrantCapability(
  roles: readonly RoleName[],
  capability: Capability,
): boolean {
  const allowed = CAPABILITY_MATRIX[capability];
  return roles.some((role) => allowed.includes(role));
}
