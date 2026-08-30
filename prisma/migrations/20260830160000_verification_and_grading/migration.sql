-- =====================================================================
-- M09: verification and grading. See docs/modules/M09.md "Scope
-- decisions" for why each of these exists.
-- =====================================================================

-- Where the Focal Person's grade recommendation lives between rows 11
-- and 12/13 -- grades.recommended_by/awarded_by are both required
-- simultaneously, so there's nowhere on that table to park a pending
-- recommendation.
ALTER TABLE "cases"
  ADD COLUMN "recommended_grade_value" "GradeValue",
  ADD COLUMN "recommended_by" UUID;

-- A real gap in M01's grants: grades itself is append-only
-- (REVOKE UPDATE, DELETE), but grade_reversals -- the correction record
-- BR-14 depends on for its own integrity -- was never given the same
-- treatment.
REVOKE UPDATE, DELETE ON "grade_reversals" FROM scit_app;
