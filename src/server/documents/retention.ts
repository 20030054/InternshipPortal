import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import { prisma } from "@/server/db/client";
import type { DocumentArchive } from "@prisma/client";

/**
 * OQ-07, answered (D-123): "at the end of each year, make a zip file
 * and ask Admin to download it; once downloaded, delete these." See
 * `prisma/schema.prisma`'s `DocumentArchive`/`Document.purgedAt` doc
 * comments for why only the file *bytes* are ever purged — the
 * `Document` row, checksum, and every `Verification` against it stay
 * forever, exactly as §9 already requires.
 */

function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) {
    throw new Error("UPLOAD_DIR is not set — nowhere to read uploaded files from.");
  }
  return dir;
}

export class EmptyArchiveError extends Error {
  constructor(public readonly year: number) {
    super(`No un-archived documents exist for ${year}.`);
    this.name = "EmptyArchiveError";
  }
}

export class ArchiveNotFoundError extends Error {
  constructor(public readonly archiveId: string) {
    super(`No archive with id ${archiveId}.`);
    this.name = "ArchiveNotFoundError";
  }
}

/**
 * Bundles every not-yet-archived, not-yet-purged document whose
 * `createdAt` falls in `year` into a new `DocumentArchive` row,
 * stamping each matched `Document.archiveId` in the same transaction
 * — bookkeeping only, nothing is read or deleted from disk here. Safe
 * to call again for a year already fully archived: it simply finds
 * zero eligible documents and throws `EmptyArchiveError` rather than
 * creating an empty, useless archive row.
 */
export async function createDocumentArchive(
  year: number,
  requestedBy: string,
): Promise<DocumentArchive> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const eligible = await prisma.document.findMany({
    where: { createdAt: { gte: yearStart, lt: yearEnd }, archiveId: null, purgedAt: null },
    select: { id: true },
  });
  if (eligible.length === 0) {
    throw new EmptyArchiveError(year);
  }

  return prisma.$transaction(async (tx) => {
    const archive = await tx.documentArchive.create({
      data: { year, requestedBy, documentCount: eligible.length },
    });
    await tx.document.updateMany({
      where: { id: { in: eligible.map((d) => d.id) } },
      data: { archiveId: archive.id },
    });
    return archive;
  });
}

/**
 * Streams a zip of every un-purged document linked to `archiveId` —
 * re-callable as many times as needed (network failure, Admin wants a
 * second copy) since nothing is deleted until `confirmArchivePurge()`
 * is called separately, explicitly. Filenames inside the zip are
 * `<documentId>-<originalFilename>` — `originalFilename` alone isn't
 * guaranteed unique across documents, `documentId` is.
 */
export async function streamArchiveZip(archiveId: string): Promise<NodeJS.ReadableStream> {
  const archive = await prisma.documentArchive.findUnique({ where: { id: archiveId } });
  if (!archive) throw new ArchiveNotFoundError(archiveId);

  const documents = await prisma.document.findMany({
    where: { archiveId, purgedAt: null },
    select: { id: true, storageKey: true, originalFilename: true },
  });

  const zip = new ZipArchive({ zlib: { level: 9 } });
  const output = new PassThrough();
  zip.pipe(output);

  const dir = uploadDir();
  for (const doc of documents) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stream = createReadStream(path.join(dir, doc.storageKey));
    zip.append(stream, { name: `${doc.id}-${doc.originalFilename}` });
  }
  void zip.finalize();

  return output;
}

/**
 * The actual gate: only called from a distinct, explicit Admin
 * confirmation, never automatically and never as a side effect of
 * generating or downloading the zip. Deletes each linked document's
 * file from disk and stamps `purgedAt`; a file already missing (a
 * prior partial run, manual cleanup) is treated as already purged
 * rather than failing the whole batch — the *row* staying intact is
 * what §9 actually requires, not that this specific call path is the
 * only thing that could ever remove a file.
 */
export async function confirmArchivePurge(archiveId: string): Promise<{ purgedCount: number }> {
  const archive = await prisma.documentArchive.findUnique({ where: { id: archiveId } });
  if (!archive) throw new ArchiveNotFoundError(archiveId);

  const documents = await prisma.document.findMany({
    where: { archiveId, purgedAt: null },
    select: { id: true, storageKey: true },
  });

  const dir = uploadDir();
  let purgedCount = 0;
  for (const doc of documents) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(path.join(dir, doc.storageKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    await prisma.document.update({ where: { id: doc.id }, data: { purgedAt: new Date() } });
    purgedCount += 1;
  }

  await prisma.documentArchive.update({
    where: { id: archiveId },
    data: { confirmedAt: new Date() },
  });

  return { purgedCount };
}

export async function listDocumentArchives(): Promise<DocumentArchive[]> {
  return prisma.documentArchive.findMany({ orderBy: { createdAt: "desc" } });
}
