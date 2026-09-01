import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { GET as getDownload } from "@/app/api/documents/[id]/download/route";
import { storeDocument } from "@/server/documents/store";
import {
  createDocumentArchive,
  streamArchiveZip,
  confirmArchivePurge,
  EmptyArchiveError,
} from "@/server/documents/retention";
import { prisma } from "@/server/db/client";
import { sessionState } from "./setup";
import { assignRole, createCaseFixture, createUserFixture } from "./support/prisma-fixtures";
import { validPdfFile } from "./support/files";

/**
 * OQ-07, answered (D-123): documents' `createdAt` isn't controllable
 * through `storeDocument()`'s own API (always "now"), so
 * `createDocumentArchive()` itself can only ever be exercised against
 * the *real* current year — and that sweep is deliberately unscoped
 * (every eligible document that year, matching real-world use). Found
 * live, the hard way: calling it directly in a test with the full
 * shared database populated by every other file's own documents pulls
 * in ones this file knows nothing about — including at least one
 * whose file the M06 supersede/hardening tests deliberately don't
 * leave on disk, which turned a zip-generation test into an
 * unrelated-document ENOENT. `streamArchiveZip()`/`confirmArchivePurge()`
 * are exercised here against a hand-built, single-document archive
 * (bypassing the sweep) specifically to stay immune to that; the
 * sweep itself (`createDocumentArchive()`) is tested separately,
 * narrowly, checking only that *this test's own* document ends up
 * archived — never generating a zip from the shared pool.
 */
async function readZipEntryNames(stream: NodeJS.ReadableStream): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  return Object.keys(zip.files);
}

describe("D-123: document retention (OQ-07) — archive, download, confirm-purge", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("download and confirm-purge, against a hand-built single-document archive", async () => {
    const uploader = await createUserFixture();
    const kase = await createCaseFixture();
    const document = await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile("retention-test.pdf"),
      uploadedBy: uploader.id,
    });

    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");

    // Hand-built, not createDocumentArchive() — see file doc comment.
    const archive = await prisma.documentArchive.create({
      data: { year: new Date().getUTCFullYear(), requestedBy: admin.id, documentCount: 1 },
    });
    await prisma.document.update({
      where: { id: document.id },
      data: { archiveId: archive.id },
    });

    const zipStream = await streamArchiveZip(archive.id);
    const entryNames = await readZipEntryNames(zipStream);
    expect(entryNames).toEqual([`${document.id}-retention-test.pdf`]);

    // Not yet purged -- the real document-download route still serves it.
    await assignRole(uploader.id, "FOCAL");
    sessionState.current = { user: { id: uploader.id } };
    const beforePurgeResponse = await getDownload(new Request("http://test"), {
      params: Promise.resolve({ id: document.id }),
    });
    expect(beforePurgeResponse.status).toBe(200);

    const { purgedCount } = await confirmArchivePurge(archive.id);
    expect(purgedCount).toBe(1);

    const afterPurge = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    // The row survives, forever, exactly as §9 requires -- only the
    // file bytes are gone.
    expect(afterPurge.id).toBe(document.id);
    expect(afterPurge.checksumSha256).toBe(document.checksumSha256);
    expect(afterPurge.purgedAt).not.toBeNull();

    const archiveAfter = await prisma.documentArchive.findUniqueOrThrow({
      where: { id: archive.id },
    });
    expect(archiveAfter.confirmedAt).not.toBeNull();

    // The real download route now returns 410, not a raw ENOENT crash.
    const afterPurgeResponse = await getDownload(new Request("http://test"), {
      params: Promise.resolve({ id: document.id }),
    });
    expect(afterPurgeResponse.status).toBe(410);
  });

  it("createDocumentArchive() sweeps this test's own not-yet-archived document into a new archive", async () => {
    const uploader = await createUserFixture();
    const kase = await createCaseFixture();
    const document = await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile("sweep-test.pdf"),
      uploadedBy: uploader.id,
    });

    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    const archive = await createDocumentArchive(new Date().getUTCFullYear(), admin.id);

    const afterArchive = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(afterArchive.archiveId).toBe(archive.id);
    expect(afterArchive.purgedAt).toBeNull();
  });

  it("throws EmptyArchiveError for a year with nothing eligible, rather than creating a useless archive row", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    await expect(createDocumentArchive(1999, admin.id)).rejects.toThrow(EmptyArchiveError);
  });
});
