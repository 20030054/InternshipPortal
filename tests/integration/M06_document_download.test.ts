import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/documents/[id]/download/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createCaseFixture,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";
import { storeDocument } from "@/server/documents/store";
import { validPdfFile, VALID_PDF_BYTES } from "./support/files";
import { prisma } from "@/server/db/client";

/**
 * MASTER_PROMPT.md §9: "Downloads stream through an authenticated
 * handler with Content-Disposition: attachment and X-Content-Type-
 * Options: nosniff." Done criterion: "a direct URL guess returns 404
 * and every download appears in the audit log."
 */
describe("M06: GET /api/documents/:id/download", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  async function ownedDocument() {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    const document = await storeDocument({
      caseId: kase.id,
      type: "OFFER_LETTER",
      file: validPdfFile("offer.pdf"),
      uploadedBy: student.userId,
    });
    return { studentUserId: student.userId, documentId: document.id };
  }

  it("the owning student can download, with the right headers and body", async () => {
    const { studentUserId, documentId } = await ownedDocument();
    sessionState.current = { user: { id: studentUserId } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain('attachment; filename="offer.pdf"');
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(Buffer.from(VALID_PDF_BYTES))).toBe(true);
  });

  it("a Focal Person can download any case's document", async () => {
    const { documentId } = await ownedDocument();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(response.status).toBe(200);
  });

  it("another student gets 404 and the denial is audited", async () => {
    const { documentId } = await ownedDocument();
    const other = await createStudentFixture();
    await assignRole(other.userId, "STUDENT");
    sessionState.current = { user: { id: other.userId } };

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(response.status).toBe(404);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "document", entityId: documentId, eventType: "DOCUMENT_DOWNLOAD_DENIED" },
    });
    expect(audit.actorUserId).toBe(other.userId);
  });

  it("a successful download is audited", async () => {
    const { studentUserId, documentId } = await ownedDocument();
    sessionState.current = { user: { id: studentUserId } };

    await GET(new Request("http://test"), { params: Promise.resolve({ id: documentId }) });

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "document", entityId: documentId, eventType: "DOCUMENT_DOWNLOADED" },
    });
    expect(audit.actorUserId).toBe(studentUserId);
  });

  it("a random UUID (no such document) 404s with nothing to audit", async () => {
    const { studentUserId } = await ownedDocument();
    sessionState.current = { user: { id: studentUserId } };

    const randomId = "00000000-0000-7000-8000-000000000000";
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: randomId }),
    });
    expect(response.status).toBe(404);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityType: "document", entityId: randomId },
    });
    expect(audit).toBeNull();
  });

  it("401s when unauthenticated", async () => {
    const { documentId } = await ownedDocument();
    sessionState.current = null;

    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ id: documentId }),
    });
    expect(response.status).toBe(401);
  });
});
