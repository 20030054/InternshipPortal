-- CreateEnum
CREATE TYPE "SemesterStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "auto_enrolled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: sequence_number is added nullable first, not NOT NULL
-- directly — a real production database is empty here (this migration
-- runs before any seed data ever could), but a dev database that already
-- ran prisma/seed.ts has existing semester rows, and a bare `NOT NULL`
-- add would fail against them. Backfilled below, then constrained.
ALTER TABLE "semesters" ADD COLUMN     "sequence_number" INTEGER;
ALTER TABLE "semesters" ADD COLUMN     "status" "SemesterStatus" NOT NULL DEFAULT 'UPCOMING';

-- CreateTable
CREATE TABLE "roster_imports" (
    "id" UUID NOT NULL,
    "imported_by" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "created_count" INTEGER NOT NULL,
    "updated_count" INTEGER NOT NULL,
    "error_count" INTEGER NOT NULL,
    "errors" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_imports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "roster_imports" ADD CONSTRAINT "roster_imports_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Hand-written from here down, same pattern as M01/M02's migrations:
-- backfill for pre-existing dev data, then the constraints Prisma's
-- schema DSL can't express (partial unique index for BR-01/M03 "at most
-- one OPEN semester").
-- =====================================================================

-- Best-effort backfill ordering for any semester rows that already exist
-- (dev databases seeded before this migration ran) — FALL/SPRING/SUMMER
-- ranked to match a Fall-starts-the-academic-year calendar, which is a
-- reasonable assumption for this one-time backfill only. Real production
-- data is empty at this point and never touches this CASE expression;
-- every semester created after this migration gets its sequence_number
-- explicitly from the semester-creation route
-- (src/server/roster/semesters.ts), not from calendar guesswork.
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY year, CASE type WHEN 'FALL' THEN 0 WHEN 'SPRING' THEN 1 WHEN 'SUMMER' THEN 2 END
    ) AS rn
  FROM "semesters"
)
UPDATE "semesters" s
SET "sequence_number" = ordered.rn
FROM ordered
WHERE s.id = ordered.id;

ALTER TABLE "semesters" ALTER COLUMN "sequence_number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "semesters_sequence_number_key" ON "semesters"("sequence_number");

-- ---------------------------------------------------------------------
-- MASTER_PROMPT.md §2.6: "open/close semesters" is how the current
-- semester is known — at most one may be OPEN at a time. Same mechanism
-- as M01's cases_one_nonterminal_per_student and M02's
-- password_reset_tokens_one_live_per_user: a partial unique index rather
-- than a plain CHECK, since this is a table-wide invariant (at most one
-- row with this property), not a single-row rule.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "semesters_at_most_one_open"
  ON "semesters" ((true))
  WHERE "status" = 'OPEN';
