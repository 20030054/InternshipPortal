import { describe, expect, it } from "vitest";
import type { RoleName } from "@prisma/client";
import {
  CAPABILITY_MATRIX,
  type Capability,
  rolesGrantCapability,
} from "@/server/authz/matrix";

const ALL_ROLES: RoleName[] = ["STUDENT", "FOCAL", "HOD", "DEAN", "ADMIN"];

/**
 * Transcribed directly from MASTER_PROMPT.md §3's table — independent of
 * matrix.ts's own contents, so this test can actually catch a transcription
 * error rather than just restating the file under test.
 */
const EXPECTED: Record<Capability, RoleName[]> = {
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
  // Not one of §3's eighteen rows -- a real gap BR-14 needs (M09), not a
  // transcription from the table. See docs/modules/M09.md.
  "grade.reverse": ["DEAN"],
  "restart.initiate": ["FOCAL"],
  "restart.countersign": ["HOD"],
  "escalation.rule_restart": ["DEAN"],
  "waiver.initiate": ["FOCAL"],
  "waiver.countersign": ["HOD"],
  "waiver.approve_final": ["DEAN"],
  "users.manage": ["ADMIN"],
  "audit.edit": [],

  // M02 scaffolding capabilities — not in §3, so no independent spec to
  // transcribe from; asserted against their own stated intent instead.
  "self.view": ["STUDENT", "FOCAL", "HOD", "DEAN", "ADMIN"],
  "student.view_own": ["STUDENT"],
  "student.view_any": ["FOCAL", "HOD", "DEAN"],

  // M13: screen-level view gates, not in §3 either — see
  // docs/modules/M13.md "Scope decisions."
  "dashboard.view_student": ["STUDENT"],
  "dashboard.view_focal": ["FOCAL"],
  "dashboard.view_hod": ["HOD"],
  "dashboard.view_dean": ["DEAN"],
};

describe("capability matrix matches MASTER_PROMPT.md §3", () => {
  it.each(Object.entries(EXPECTED))(
    "%s is granted to exactly %j",
    (capability, expectedRoles) => {
      const actualRoles = [...CAPABILITY_MATRIX[capability as Capability]].sort();
      expect(actualRoles).toEqual([...expectedRoles].sort());
    },
  );

  it("audit.edit is granted to no role — the §3 row with no checkmarks", () => {
    expect(CAPABILITY_MATRIX["audit.edit"]).toEqual([]);
    for (const role of ALL_ROLES) {
      expect(rolesGrantCapability([role], "audit.edit")).toBe(false);
    }
  });

  it("every capability declared in the type is present in the matrix", () => {
    const declaredKeys = Object.keys(EXPECTED) as Capability[];
    for (const key of declaredKeys) {
      expect(CAPABILITY_MATRIX).toHaveProperty(key);
    }
  });

  describe("rolesGrantCapability", () => {
    it("returns true when any held role grants the capability", () => {
      expect(rolesGrantCapability(["STUDENT", "FOCAL"], "grade.recommend")).toBe(
        true,
      );
    });

    it("returns false when no held role grants the capability", () => {
      expect(rolesGrantCapability(["STUDENT"], "grade.award")).toBe(false);
    });

    it("returns false for an empty role list", () => {
      expect(rolesGrantCapability([], "self.view")).toBe(false);
    });
  });
});
