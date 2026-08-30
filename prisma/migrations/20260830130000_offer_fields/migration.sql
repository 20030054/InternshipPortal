-- =====================================================================
-- M05: offer-letter fields land on `cases` (M01 explicitly deferred this
-- decision — see docs/modules/M05.md "Scope decisions").
--
-- work_description backs BR-07 (>= 200 characters once set; NULL before
-- a first submission). relevance_confirmed backs BR-09 (the Focal
-- Person's mandatory judgement, set only at approval). The planned-dates
-- sanity check backs BR-08's "planned end after planned start" — the
-- actual week-bounds check is config-driven (MIN_INTERNSHIP_WEEKS /
-- MAX_INTERNSHIP_WEEKS) and can't be expressed as a CHECK, so it lives
-- only in the durationWithinBounds guard.
-- =====================================================================

ALTER TABLE "cases"
  ADD COLUMN "work_description" TEXT,
  ADD COLUMN "relevance_confirmed" BOOLEAN;

ALTER TABLE "cases"
  ADD CONSTRAINT "cases_work_description_length"
  CHECK ("work_description" IS NULL OR char_length("work_description") >= 200);

ALTER TABLE "cases"
  ADD CONSTRAINT "cases_planned_end_after_start"
  CHECK ("planned_end" IS NULL OR "planned_start" IS NULL OR "planned_end" > "planned_start");
