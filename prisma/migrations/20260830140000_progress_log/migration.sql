-- =====================================================================
-- M07: the progress log — one row per (case, week), replacing the
-- Google Sheet's weekly rows. See docs/modules/M07.md "Scope decisions"
-- for why this is a new table (not columns on cases) and why entries
-- are immutable once written.
--
-- No GRANT statements needed: the init migration's
-- `ALTER DEFAULT PRIVILEGES ... GRANT ... ON TABLES TO scit_app` already
-- covers every table created by the migration role from here on, same
-- as M03's roster_imports.
-- =====================================================================

CREATE TABLE "progress_log_entries" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "progress_log_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "progress_log_entries_case_id_idx" ON "progress_log_entries"("case_id");

CREATE UNIQUE INDEX "progress_log_entries_case_id_week_number_key"
  ON "progress_log_entries"("case_id", "week_number");

ALTER TABLE "progress_log_entries"
  ADD CONSTRAINT "progress_log_entries_week_number_positive"
  CHECK ("week_number" >= 1);

ALTER TABLE "progress_log_entries"
  ADD CONSTRAINT "progress_log_entries_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "progress_log_entries"
  ADD CONSTRAINT "progress_log_entries_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
