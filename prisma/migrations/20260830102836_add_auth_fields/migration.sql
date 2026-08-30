-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Hand-written, appended after `prisma migrate dev --create-only`
-- generated the DDL above — same pattern as M01's init migration (see
-- that file's own header comment).
-- =====================================================================

-- ---------------------------------------------------------------------
-- At most one *live* password reset token per user, same mechanism as
-- M01's supervisor_tokens_one_live_per_case. issuePasswordResetToken()
-- (src/server/auth/password-reset.ts) revokes any existing live token
-- before creating a new one; this index makes "at most one live" true
-- regardless of whether that ordering is ever gotten wrong.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX "password_reset_tokens_one_live_per_user"
  ON "password_reset_tokens" ("user_id")
  WHERE "used_at" IS NULL AND "revoked_at" IS NULL;

-- No grant changes needed: M01's
-- ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scit_app
-- already covers password_reset_tokens, and the users table's grants
-- (also full CRUD for scit_app) already cover its three new columns —
-- neither is one of the append-only/immutable tables M01 restricted.
