import { describe, expect, it } from "vitest";
import { storeDocument } from "@/server/documents/store";
import { prisma } from "@/server/db/client";
import { createCaseFixture, createUserFixture } from "./support/prisma-fixtures";
import { validPdfFile } from "./support/files";

/**
 * MASTER_PROMPT.md §9: "No document is ever deletable; superseded
 * documents are marked SUPERSEDED and retained." A real gap M05's
 * interim writer left open — see docs/modules/M06.md.
 */
describe("M06: document supersede-on-reupload", () => {
  it("re-uploading the same (caseId, type) marks the prior ACTIVE row SUPERSEDED, never deletes it", async () => {
    const kase = await createCaseFixture({ state: "IN_PROGRESS" });
    const uploader = await createUserFixture();

    const first = await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile("first.pdf"),
      uploadedBy: uploader.id,
    });
    const second = await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile("second.pdf"),
      uploadedBy: uploader.id,
    });

    const refreshedFirst = await prisma.document.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(refreshedFirst.status).toBe("SUPERSEDED");
    expect(second.status).toBe("ACTIVE");

    const allDocs = await prisma.document.findMany({ where: { caseId: kase.id } });
    expect(allDocs).toHaveLength(2);
  });

  it("re-uploading a different type for the same case doesn't touch the first type's status", async () => {
    const kase = await createCaseFixture({ state: "IN_PROGRESS" });
    const uploader = await createUserFixture();

    const offerLetter = await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile(),
      uploadedBy: uploader.id,
    });
    await storeDocument({
      caseId: kase.id,
      type: "COMPLETION_CERTIFICATE",
      file: validPdfFile(),
      uploadedBy: uploader.id,
    });

    const refreshedOfferLetter = await prisma.document.findUniqueOrThrow({
      where: { id: offerLetter.id },
    });
    expect(refreshedOfferLetter.status).toBe("ACTIVE");
  });

  it("a SUPERSEDED document can never move back to ACTIVE (M01's trigger, defence in depth)", async () => {
    const kase = await createCaseFixture({ state: "IN_PROGRESS" });
    const uploader = await createUserFixture();
    const first = await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile(),
      uploadedBy: uploader.id,
    });
    await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile(),
      uploadedBy: uploader.id,
    });

    await expect(
      prisma.document.update({ where: { id: first.id }, data: { status: "ACTIVE" } }),
    ).rejects.toThrow();
  });
});
