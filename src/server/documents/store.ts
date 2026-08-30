import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Document, DocumentType } from "@prisma/client";
import { prisma } from "@/server/db/client";

/**
 * A deliberately minimal interim upload writer — M06 (document vault) is
 * the real thing: magic-byte sniffing, a ClamAV scan, and the
 * authenticated streaming download route all belong there, not here. See
 * docs/modules/M05.md "Scope decisions." What this *does* do already
 * matches M06's own description of shared infra: MIME allowlist check,
 * a size cap, a SHA-256 checksum, a UUID storage key, written outside
 * the web root. M06 hardens the write path in place (add sniffing, add
 * scanning) and adds the read path; this module's `Document` rows and
 * callers don't change shape when it does.
 */

export class EmptyFileError extends Error {
  constructor() {
    super("Uploaded file is empty.");
    this.name = "EmptyFileError";
  }
}

export class FileTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Uploaded file exceeds the ${maxBytes}-byte limit.`);
    this.name = "FileTooLargeError";
  }
}

export class UnsupportedFileTypeError extends Error {
  constructor(public readonly mimeType: string) {
    super(`Unsupported file type: ${mimeType}`);
    this.name = "UnsupportedFileTypeError";
  }
}

function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) {
    throw new Error("UPLOAD_DIR is not set — nowhere to write uploaded files.");
  }
  return dir;
}

function allowedMimeTypes(): readonly string[] {
  return (process.env.ALLOWED_MIME ?? "application/pdf,image/jpeg,image/png")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 10);
  return mb * 1024 * 1024;
}

export async function storeDocument(input: {
  caseId: string;
  type: DocumentType;
  file: File;
  uploadedBy: string;
}): Promise<Document> {
  if (input.file.size === 0) {
    throw new EmptyFileError();
  }
  const maxBytes = maxUploadBytes();
  if (input.file.size > maxBytes) {
    throw new FileTooLargeError(maxBytes);
  }
  if (!allowedMimeTypes().includes(input.file.type)) {
    throw new UnsupportedFileTypeError(input.file.type);
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = randomUUID();

  const dir = uploadDir();
  // uploadDir() is server-configured (UPLOAD_DIR), never client input, and
  // storageKey is always our own randomUUID() — never the client-supplied
  // originalFilename, which is metadata only and never touches a
  // filesystem path (MASTER_PROMPT.md §9 "Files"). Both are non-literal
  // by construction, not by user control, hence the disables below.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(dir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(path.join(dir, storageKey), bytes);

  return prisma.document.create({
    data: {
      caseId: input.caseId,
      type: input.type,
      storageKey,
      originalFilename: input.file.name,
      checksumSha256,
      uploadedBy: input.uploadedBy,
    },
  });
}
