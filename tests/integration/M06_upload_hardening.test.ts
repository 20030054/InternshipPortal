import { describe, expect, it, vi } from "vitest";
import {
  FileContentMismatchError,
  storeDocument,
} from "@/server/documents/store";
import { InfectedFileError, scanBuffer } from "@/server/documents/clamav";
import { createCaseFixture, createUserFixture } from "./support/prisma-fixtures";
import { validPdfFile, VALID_PDF_BYTES } from "./support/files";

/**
 * MASTER_PROMPT.md §9: "validated by extension and magic bytes and
 * MIME, scanned by ClamAV." `scanBuffer()` is mocked clean by default
 * (tests/integration/setup.ts) — the infected-file case here overrides
 * that mock for one call to prove the reject path actually runs; the
 * real clamd protocol is only proven for real against the compose
 * stack (docs/modules/M06.md).
 */
describe("M06: storeDocument() upload hardening", () => {
  async function caseAndUploader() {
    const kase = await createCaseFixture({ state: "IN_PROGRESS" });
    const uploader = await createUserFixture();
    return { caseId: kase.id, uploadedBy: uploader.id };
  }

  it("rejects a MIME/magic-byte mismatch (declared PDF, PNG bytes)", async () => {
    const { caseId, uploadedBy } = await caseAndUploader();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([pngBytes], "offer.pdf", { type: "application/pdf" });

    await expect(
      storeDocument({ caseId, type: "OFFER_LETTER", file, uploadedBy }),
    ).rejects.toBeInstanceOf(FileContentMismatchError);
  });

  it("rejects garbage bytes matching no known signature", async () => {
    const { caseId, uploadedBy } = await caseAndUploader();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "offer.pdf", {
      type: "application/pdf",
    });

    await expect(
      storeDocument({ caseId, type: "OFFER_LETTER", file, uploadedBy }),
    ).rejects.toBeInstanceOf(FileContentMismatchError);
  });

  it("rejects an extension that doesn't match the (correctly sniffed) content", async () => {
    const { caseId, uploadedBy } = await caseAndUploader();
    const file = new File([VALID_PDF_BYTES], "offer.png", { type: "application/pdf" });

    await expect(
      storeDocument({ caseId, type: "OFFER_LETTER", file, uploadedBy }),
    ).rejects.toBeInstanceOf(FileContentMismatchError);
  });

  it("rejects a file the virus scanner flags as infected", async () => {
    const { caseId, uploadedBy } = await caseAndUploader();
    vi.mocked(scanBuffer).mockRejectedValueOnce(
      new InfectedFileError("Eicar-Test-Signature"),
    );

    await expect(
      storeDocument({ caseId, type: "OFFER_LETTER", file: validPdfFile(), uploadedBy }),
    ).rejects.toBeInstanceOf(InfectedFileError);
  });

  it("accepts a genuinely valid PDF", async () => {
    const { caseId, uploadedBy } = await caseAndUploader();

    const document = await storeDocument({
      caseId,
      type: "OFFER_LETTER",
      file: validPdfFile(),
      uploadedBy,
    });

    expect(document.status).toBe("ACTIVE");
    expect(document.checksumSha256).toHaveLength(64);
  });
});
