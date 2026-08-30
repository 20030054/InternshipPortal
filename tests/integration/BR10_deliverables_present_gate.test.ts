import { afterEach, describe, expect, it } from "vitest";
import { POST as uploadCompletionCertificate } from "@/app/api/cases/[id]/completion-certificate/route";
import { POST as postEvaluation } from "@/app/api/supervisor/evaluate/[token]/route";
import { sessionState } from "./setup";
import { assignRole } from "./support/prisma-fixtures";
import { createDocsPendingCase } from "./support/case-lifecycle";
import { validPdfFile } from "./support/files";
import { issueSupervisorToken } from "@/server/supervisor/service";
import { prisma } from "@/server/db/client";

let ipCounter = 0;
function evalRequest(body: unknown): Request {
  ipCounter += 1;
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": `10.98.9.${ipCounter}` },
  });
}

/**
 * BR-10: row 9 (`DOCS_PENDING -> PENDING_VERIFICATION`, SYSTEM) fires
 * automatically once all three deliverables exist — this case's real
 * offer letter (from case-lifecycle.ts's walk through M05) already
 * covers the first leg; this test adds the other two through the real
 * M06/M08 routes and confirms the auto-chain.
 */
describe("BR-10: all three deliverables present gates row 9", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("does not fire with only the offer letter present", async () => {
    const { caseId } = await createDocsPendingCase(6000);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("DOCS_PENDING");
  });

  it("does not fire with only two of three present (completion cert added, no evaluation)", async () => {
    const { caseId, studentUserId } = await createDocsPendingCase(6010);
    await assignRole(studentUserId, "STUDENT");
    sessionState.current = { user: { id: studentUserId } };

    const formData = new FormData();
    formData.append("file", validPdfFile("certificate.pdf"));
    const realResponse = await uploadCompletionCertificate(
      new Request("http://test", { method: "POST", body: formData }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(realResponse.status).toBe(201);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("DOCS_PENDING");
  });

  it("fires automatically once the third (evaluation) arrives, via the real public route", async () => {
    const { caseId, studentUserId, focalUserId } = await createDocsPendingCase(6020);
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

    const response = await postEvaluation(
      evalRequest({ performanceRating: 5, comments: "Great intern." }),
      { params: Promise.resolve({ token: rawToken }) },
    );
    expect(response.status).toBe(201);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("PENDING_VERIFICATION");

    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId, toState: "PENDING_VERIFICATION" },
    });
    expect(event.fromState).toBe("DOCS_PENDING");
    expect(event.systemJob).toBe("deliverables-complete");
  });

  it("fires when the completion certificate arrives last instead", async () => {
    const { caseId, studentUserId, focalUserId } = await createDocsPendingCase(6030);
    await assignRole(studentUserId, "STUDENT");

    const { rawToken } = await issueSupervisorToken({
      caseId,
      supervisorEmail: "supervisor@acme.test",
      issuedBy: focalUserId,
    });
    await postEvaluation(evalRequest({ performanceRating: 4, comments: "Solid." }), {
      params: Promise.resolve({ token: rawToken }),
    });

    const midway = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(midway.state).toBe("DOCS_PENDING");

    sessionState.current = { user: { id: studentUserId } };
    const formData = new FormData();
    formData.append("file", validPdfFile("certificate.pdf"));
    await uploadCompletionCertificate(
      new Request("http://test", { method: "POST", body: formData }),
      { params: Promise.resolve({ id: caseId }) },
    );

    const after = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(after.state).toBe("PENDING_VERIFICATION");
  });
});
