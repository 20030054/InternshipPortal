import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Document, DocumentType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { extensionMatches, sniffFileType, type SupportedMime } from "./magic-bytes";
import { scanBuffer } from "./clamav";

/**
 * MASTER_PROMPT.md §9: "Uploads are validated by extension and magic
 * bytes and MIME, scanned by ClamAV, then stored under a UUID filename
 * in the volume." All four checks, cheapest first (size, then the MIME
 * label, then magic bytes, then extension), with the ClamAV round-trip
 * last since it's the slowest. "No document is ever deletable;
 * superseded documents are marked SUPERSEDED and retained" — a re-upload
 * for the same (caseId, type) marks whatever was ACTIVE before it
 * SUPERSEDED, in the same transaction as the new row's insert, rather
 * than leaving two ACTIVE rows behind (a real gap M05's interim writer
 * left open — see docs/modules/M06.md).
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

/** Covers both "the declared MIME doesn't match what the bytes actually
 * are" and "the filename's extension doesn't match the MIME" — both are
 * the same class of problem (a mislabeled file) and callers don't need
 * to distinguish them. */
export class FileContentMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileContentMismatchError";
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

  const sniffed = sniffFileType(bytes);
  if (sniffed === null) {
    throw new FileContentMismatchError(
      "File content does not match any supported file type's magic bytes.",
    );
  }
  if (sniffed !== input.file.type) {
    throw new FileContentMismatchError(
      `File content looks like ${sniffed}, not the declared ${input.file.type}.`,
    );
  }
  if (!extensionMatches(input.file.name, sniffed as SupportedMime)) {
    throw new FileContentMismatchError(
      `File extension does not match its content type (${sniffed}).`,
    );
  }

  // Fails closed: scanBuffer() throws (InfectedFileError or
  // ScanUnavailableError) rather than resolving to a "did it pass?"
  // boolean, so there's no code path here that could accidentally treat
  // an unreachable scanner as "clean."
  await scanBuffer(bytes);

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

  return prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { caseId: input.caseId, type: input.type, status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    });
    return tx.document.create({
      data: {
        caseId: input.caseId,
        type: input.type,
        storageKey,
        originalFilename: input.file.name,
        checksumSha256,
        uploadedBy: input.uploadedBy,
      },
    });
  });
}
