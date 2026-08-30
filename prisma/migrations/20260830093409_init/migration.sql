-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('STUDENT', 'FOCAL', 'HOD', 'DEAN', 'ADMIN');

-- CreateEnum
CREATE TYPE "SemesterType" AS ENUM ('FALL', 'SPRING', 'SUMMER');

-- CreateEnum
CREATE TYPE "CaseState" AS ENUM ('ELIGIBILITY_PENDING', 'ELIGIBLE', 'OFFER_SUBMITTED', 'OFFER_UNDER_REVIEW', 'OFFER_REJECTED', 'APPROVED', 'IN_PROGRESS', 'DOCS_PENDING', 'PENDING_VERIFICATION', 'VERIFIED', 'GRADE_RECOMMENDED', 'CLOSED_PASS', 'CLOSED_INCOMPLETE', 'WITHDRAWN', 'RESTART_REQUESTED', 'RESTART_AUTHORIZED', 'RESTART_DENIED', 'WAIVER_REQUESTED', 'WAIVER_COUNTERSIGNED', 'WAIVER_GRANTED', 'WAIVER_DENIED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('OFFER_LETTER', 'COMPLETION_CERTIFICATE', 'SUPPORTING_EVIDENCE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('DOCUMENT_INSPECTED', 'EMPLOYER_CONTACTED_PHONE', 'EMPLOYER_CONTACTED_EMAIL', 'SUPERVISOR_LINK_CONFIRMED');

-- CreateEnum
CREATE TYPE "GradeValue" AS ENUM ('P', 'I');

-- CreateEnum
CREATE TYPE "RestartOutcome" AS ENUM ('PENDING', 'AUTHORIZED', 'DENIED');

-- CreateEnum
CREATE TYPE "WaiverOutcome" AS ENUM ('PENDING', 'GRANTED', 'DENIED');

-- CreateEnum
CREATE TYPE "EscalationSubjectType" AS ENUM ('RESTART_DENIED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "registration_number" TEXT NOT NULL,
    "admission_semester_id" UUID NOT NULL,
    "programme" TEXT NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "type" "SemesterType" NOT NULL,
    "year" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "document_deadline" DATE,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalised_name" TEXT NOT NULL,
    "registration_number" TEXT,
    "contact" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "state" "CaseState" NOT NULL DEFAULT 'ELIGIBILITY_PENDING',
    "previous_case_id" UUID,
    "company_id" UUID,
    "planned_start" DATE,
    "planned_end" DATE,
    "actual_start" DATE,
    "actual_end" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "system_job" TEXT,
    "from_state" "CaseState" NOT NULL,
    "to_state" "CaseState" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "verifier_user_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "value" "GradeValue" NOT NULL,
    "recommended_by" UUID NOT NULL,
    "awarded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_reversals" (
    "id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "dean_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_tokens" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "supervisor_token_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restart_requests" (
    "id" UUID NOT NULL,
    "failed_case_id" UUID NOT NULL,
    "new_company_id" UUID NOT NULL,
    "g1_result" JSONB NOT NULL,
    "g2_result" JSONB NOT NULL,
    "focal_signer_id" UUID NOT NULL,
    "focal_reason" TEXT NOT NULL,
    "focal_signed_at" TIMESTAMPTZ NOT NULL,
    "hod_signer_id" UUID,
    "hod_reason" TEXT,
    "hod_signed_at" TIMESTAMPTZ,
    "outcome" "RestartOutcome" NOT NULL DEFAULT 'PENDING',
    "restart_cap_at_request" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restart_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waivers" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "circumstance" TEXT NOT NULL,
    "focal_signer_id" UUID,
    "focal_reason" TEXT,
    "focal_signed_at" TIMESTAMPTZ,
    "hod_signer_id" UUID,
    "hod_reason" TEXT,
    "hod_signed_at" TIMESTAMPTZ,
    "dean_signer_id" UUID,
    "dean_reason" TEXT,
    "dean_signed_at" TIMESTAMPTZ,
    "outcome" "WaiverOutcome" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" UUID NOT NULL,
    "subject_type" "EscalationSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "dean_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "ruling" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "system_job" TEXT,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "case_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_registration_number_key" ON "students"("registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_type_year_key" ON "semesters"("type", "year");

-- CreateIndex
CREATE INDEX "companies_normalised_name_idx" ON "companies"("normalised_name");

-- CreateIndex
CREATE INDEX "cases_student_id_idx" ON "cases"("student_id");

-- CreateIndex
CREATE INDEX "case_events_case_id_idx" ON "case_events"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_case_id_idx" ON "documents"("case_id");

-- CreateIndex
CREATE INDEX "verifications_document_id_idx" ON "verifications"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_case_id_key" ON "grades"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_tokens_token_hash_key" ON "supervisor_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "supervisor_tokens_case_id_idx" ON "supervisor_tokens"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_supervisor_token_id_key" ON "evaluations"("supervisor_token_id");

-- CreateIndex
CREATE INDEX "restart_requests_failed_case_id_idx" ON "restart_requests"("failed_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "waivers_student_id_key" ON "waivers"("student_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_case_id_idx" ON "notifications"("case_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_admission_semester_id_fkey" FOREIGN KEY ("admission_semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_previous_case_id_fkey" FOREIGN KEY ("previous_case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_verifier_user_id_fkey" FOREIGN KEY ("verifier_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_recommended_by_fkey" FOREIGN KEY ("recommended_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_reversals" ADD CONSTRAINT "grade_reversals_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_reversals" ADD CONSTRAINT "grade_reversals_dean_user_id_fkey" FOREIGN KEY ("dean_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_tokens" ADD CONSTRAINT "supervisor_tokens_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_supervisor_token_id_fkey" FOREIGN KEY ("supervisor_token_id") REFERENCES "supervisor_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restart_requests" ADD CONSTRAINT "restart_requests_failed_case_id_fkey" FOREIGN KEY ("failed_case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restart_requests" ADD CONSTRAINT "restart_requests_new_company_id_fkey" FOREIGN KEY ("new_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restart_requests" ADD CONSTRAINT "restart_requests_focal_signer_id_fkey" FOREIGN KEY ("focal_signer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restart_requests" ADD CONSTRAINT "restart_requests_hod_signer_id_fkey" FOREIGN KEY ("hod_signer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_focal_signer_id_fkey" FOREIGN KEY ("focal_signer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_hod_signer_id_fkey" FOREIGN KEY ("hod_signer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_dean_signer_id_fkey" FOREIGN KEY ("dean_signer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_dean_user_id_fkey" FOREIGN KEY ("dean_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- Everything below this line is hand-written, appended after
-- `prisma migrate dev --create-only` generated the table/index/FK DDL
-- above. Prisma's schema language has no syntax for partial indexes,
-- CHECK constraints, triggers, or role/privilege management, so these
-- live here instead. See docs/modules/M01.md and DECISIONS.md D-010
-- through D-013 for the reasoning behind each block.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BR-06: at most one non-terminal case per student. Enforced by a
-- partial unique index, not only in application code -- this is the one
-- rule the whole case-integrity model depends on, so it gets the
-- strongest guarantee Postgres offers.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "cases_one_nonterminal_per_student"
  ON "cases" ("student_id")
  WHERE "state" NOT IN (
    'CLOSED_PASS', 'CLOSED_INCOMPLETE', 'WITHDRAWN',
    'WAIVER_GRANTED', 'WAIVER_DENIED', 'RESTART_DENIED'
  );

-- ---------------------------------------------------------------------
-- At most one *live* supervisor token per case. Issuing a replacement
-- token (M08) must revoke the prior one first -- this index makes "at
-- most one live token" true regardless of whether M08's service code
-- gets that ordering right.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "supervisor_tokens_one_live_per_case"
  ON "supervisor_tokens" ("case_id")
  WHERE "used_at" IS NULL AND "revoked_at" IS NULL;

-- ---------------------------------------------------------------------
-- BR-12 defence in depth. The service layer is the real authority here
-- (it compares user IDs, not role names, per MASTER_PROMPT.md section 2.3)
-- -- this CHECK exists so a bug in that comparison still cannot produce
-- a grade recommended and awarded by the same account.
-- ---------------------------------------------------------------------
ALTER TABLE "grades"
  ADD CONSTRAINT "grades_recommender_not_awarder"
  CHECK ("recommended_by" <> "awarded_by");

-- ---------------------------------------------------------------------
-- BR-17 G3/G5 defence in depth: a restart's Focal and HoD signatures
-- must come from two distinct accounts. NULL-safe for the (common)
-- moment between the Focal signature and the HoD countersignature, when
-- hod_signer_id is still NULL.
-- ---------------------------------------------------------------------
ALTER TABLE "restart_requests"
  ADD CONSTRAINT "restart_requests_focal_not_hod"
  CHECK ("hod_signer_id" IS NULL OR "focal_signer_id" <> "hod_signer_id");

-- ---------------------------------------------------------------------
-- BR-22: the exceptional-circumstance narrative must be substantive.
-- The service layer is primary; this is the floor a direct SQL write
-- cannot get under.
-- ---------------------------------------------------------------------
ALTER TABLE "waivers"
  ADD CONSTRAINT "waivers_circumstance_min_length"
  CHECK (char_length("circumstance") >= 300);

-- ---------------------------------------------------------------------
-- Documents are never deleted; a superseded document must never become
-- ACTIVE again. This needs OLD/NEW row comparison, which a plain CHECK
-- constraint cannot express (CHECK has no access to the previous row) --
-- docs/modules/M01.md originally described this as a CHECK, which was
-- imprecise; a trigger is the correct mechanism. See DECISIONS.md D-011.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION documents_forbid_reactivation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'SUPERSEDED' AND NEW.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'documents.status cannot move from SUPERSEDED back to ACTIVE (document %)', OLD.id
      USING ERRCODE = '23514'; -- check_violation
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_status_no_reactivation
  BEFORE UPDATE OF status ON "documents"
  FOR EACH ROW
  EXECUTE FUNCTION documents_forbid_reactivation();

-- ---------------------------------------------------------------------
-- BR-25 / MASTER_PROMPT.md section 5.2: the M04 transition executor is the
-- only code path permitted to write cases.state. Its UPDATE must run
-- inside a transaction that first does
--   SET LOCAL app.transition_authorized = 'true';
-- Any UPDATE targeting cases.state without that session-local flag set
-- is rejected. The flag is SET LOCAL, not SET, so it can never leak
-- past the transaction that set it -- the next statement on a pooled
-- connection starts unauthorized again by default.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cases_guard_state_write()
RETURNS trigger AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF current_setting('app.transition_authorized', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'cases.state may only be written by the transition executor (case %)', OLD.id
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_state_write_guard
  BEFORE UPDATE OF state ON "cases"
  FOR EACH ROW
  EXECUTE FUNCTION cases_guard_state_write();

-- ---------------------------------------------------------------------
-- Two database roles (MASTER_PROMPT.md section 8.2, docs/modules/M01.md).
--
-- The migration role (whoever DATABASE_MIGRATION_ROLE connects as -- the
-- role actually running this migration) owns the schema. It must have
-- CREATEROLE for the role creation below to succeed; true for the
-- bootstrap POSTGRES_USER in this project's docker-compose Postgres
-- container. See DECISIONS.md D-012.
--
-- The runtime role, "scit_app", is what `app` and `worker` connect as
-- (DATABASE_URL). It is created here WITHOUT a password -- a role with
-- LOGIN and no password set cannot authenticate -- so no secret is ever
-- committed to this file. Its password is set out-of-band by
-- scripts/db/provision-runtime-role.sh, which reads
-- DATABASE_APP_ROLE_PASSWORD from the environment and is safe to run
-- repeatedly (ALTER ROLE ... PASSWORD is idempotent).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'scit_app') THEN
    CREATE ROLE scit_app LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO scit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scit_app;

-- Applies the same grant automatically to tables created by *future*
-- migrations, run by whichever role is executing this one -- so M02
-- onward never has to remember to re-grant for a new table.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scit_app;

-- Append-only tables (BR-26): INSERT + SELECT only, no UPDATE/DELETE.
-- This is what makes the audit trail tamper-evident at the database
-- level, not merely tamper-discouraged by the absence of a delete route.
REVOKE UPDATE, DELETE ON "audit_events", "case_events" FROM scit_app;

-- Grades are immutable once written (BR-14). Corrections are additive
-- rows in grade_reversals; this table itself is never UPDATEd or
-- DELETEd by the running application.
REVOKE UPDATE, DELETE ON "grades" FROM scit_app;

-- No explicit DDL revoke is needed: CREATE on the schema/database was
-- never granted to scit_app in the first place, only implicitly held by
-- the migration role that owns these objects.
