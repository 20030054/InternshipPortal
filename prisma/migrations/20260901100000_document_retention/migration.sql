-- OQ-07, answered (D-123): a year-end retention archive. The
-- `Document` row (and its `verifications`) is never deleted — only
-- the file bytes on disk, and only after an Admin explicitly confirms
-- they downloaded this archive.
CREATE TABLE "document_archives" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "requested_by" UUID NOT NULL,
    "document_count" INTEGER NOT NULL,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_archives_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "document_archives" ADD CONSTRAINT "document_archives_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents" ADD COLUMN "archive_id" UUID;
ALTER TABLE "documents" ADD COLUMN "purged_at" TIMESTAMPTZ;

CREATE INDEX "documents_archive_id_idx" ON "documents"("archive_id");

ALTER TABLE "documents" ADD CONSTRAINT "documents_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "document_archives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
