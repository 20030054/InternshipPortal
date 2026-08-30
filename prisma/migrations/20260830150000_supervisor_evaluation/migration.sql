-- =====================================================================
-- M08: supervisor evaluation. See docs/modules/M08.md "Scope decisions"
-- for why each of these three additions exists.
-- =====================================================================

-- A real, previously-undiscovered gap: no field anywhere stores a
-- human's display name. Nullable, not backfilled -- see M08.md.
ALTER TABLE "users" ADD COLUMN "full_name" TEXT;

-- supervisor_tokens has no rows yet (no code path before this module
-- ever created one), so supervisor_email can be NOT NULL with no
-- backfill needed. reminder_count/last_reminder_sent_at back BR-28's
-- detection half (classifyTokenForReminder()/recordReminderSent()) --
-- the actual reminder-sending job stays M12's.
ALTER TABLE "supervisor_tokens"
  ADD COLUMN "supervisor_email" TEXT NOT NULL,
  ADD COLUMN "reminder_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_reminder_sent_at" TIMESTAMPTZ;
