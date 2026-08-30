import { afterEach, describe, expect, it } from "vitest";
import { POST as uploadCompletionCertificate } from "@/app/api/cases/[id]/completion-certificate/route";
import { POST as postEvaluation } from "@/app/api/supervisor/evaluate/[token]/route";
import { POST as verifyDocumentRoute } from "@/app/api/documents/[id]/verify/route";
import { POST as markVerifiedRoute } from "@/app/api/cases/[id]/mark-verified/route";
import { sessionState } from "./setup";
import { assignRole } from "./support/prisma-fixtures";
import { createDocsPendingCase } from "./support/case-lifecycle";
import { validPdfFile } from "./support/files";
import { issueSupervisorToken } from "@/server/supervisor/service";
import { prisma } from "@/server/db/client";

let ipCounter = 100;
function evalRequest(body: unknown): Request {
  ipCounter += 1;
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": `10.98.9.${ipCounter}` },
  });
}

function verifyRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** BR-11: `mark-verified` (row 10) is rejected until both Document-backed
 * deliverables are individually verified. */
describe("BR-11: mark-verified requires both documents individually verified", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  /** Walks a case all the way to PENDING_VERIFICATION (all three BR-10
   * deliverables present) through the real M06/M08 routes. */
  async function pendingVerificationCase(startSequence: number) {
    const { caseId, studentUserId, focalUserId } = await createDocsPendingCase(startSequence);
    await assignRole(studentUserId, "STUDENT");
    sessionState.current = { user: { id: studentUserId } };

    const formData = new FormData();
    formData.append("file", validPdfFile("certificate.pdf"));
    await uploadCompletionCertificate(
      new Request("http://test", { method: "POST", body: formData }),
      { params: Promise.resolve({ id: caseId }) },
    );

    const { rawToken } = await issueSupervisorToken({
      caseId,
      supervisorEmail: "supervisor@acme.test",
      issuedBy: focalUserId,
    });
    await postEvaluation(evalRequest({ performanceRating: 5, comments: "Great." }), {
      params: Promise.resolve({ token: rawToken }),
    });

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    const offerLetter = await prisma.document.findFirstOrThrow({
      where: { caseId, type: "OFFER_LETTER", status: "ACTIVE" },
    });
    const completionCertificate = await prisma.document.findFirstOrThrow({
      where: { caseId, type: "COMPLETION_CERTIFICATE", status: "ACTIVE" },
    });
    return { caseId, studentUserId, focalUserId, offerLetter, completionCertificate, state: kase.state };
  }

  it("rejects mark-verified before any document is verified", async () => {
    const { caseId, focalUserId } = await pendingVerificationCase(6100);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };

    const response = await markVerifiedRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(422);
  });

  it("rejects mark-verified with only one of two documents verified", async () => {
    const { caseId, focalUserId, offerLetter } = await pendingVerificationCase(6110);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };

    const verifyResponse = await verifyDocumentRoute(
      verifyRequest({ method: "DOCUMENT_INSPECTED" }),
      { params: Promise.resolve({ id: offerLetter.id }) },
    );
    expect(verifyResponse.status).toBe(201);

    const response = await markVerifiedRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(422);
  });

  it("succeeds once both documents are verified, any of the four methods each", async () => {
    const { caseId, focalUserId, offerLetter, completionCertificate } =
      await pendingVerificationCase(6120);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };

    await verifyDocumentRoute(verifyRequest({ method: "DOCUMENT_INSPECTED" }), {
      params: Promise.resolve({ id: offerLetter.id }),
    });
    await verifyDocumentRoute(
      verifyRequest({ method: "SUPERVISOR_LINK_CONFIRMED", note: "cross-checked" }),
      { params: Promise.resolve({ id: completionCertificate.id }) },
    );

    const response = await markVerifiedRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("VERIFIED");
  });

  it("verify route rejects a document outside PENDING_VERIFICATION", async () => {
    // Deliberately still DOCS_PENDING -- none of the three deliverables
    // beyond the offer letter have arrived yet.
    const { caseId, focalUserId } = await createDocsPendingCase(6130);
    await assignRole(focalUserId, "FOCAL");
    sessionState.current = { user: { id: focalUserId } };

    const offerLetter = await prisma.document.findFirstOrThrow({
      where: { caseId, type: "OFFER_LETTER", status: "ACTIVE" },
    });

    const response = await verifyDocumentRoute(verifyRequest({ method: "DOCUMENT_INSPECTED" }), {
      params: Promise.resolve({ id: offerLetter.id }),
    });
    expect(response.status).toBe(409);
  });

  it("verify route 403s a non-Focal session", async () => {
    const { studentUserId, offerLetter } = await pendingVerificationCase(6140);
    sessionState.current = { user: { id: studentUserId } };

    const response = await verifyDocumentRoute(verifyRequest({ method: "DOCUMENT_INSPECTED" }), {
      params: Promise.resolve({ id: offerLetter.id }),
    });
    expect(response.status).toBe(403);
  });
});
