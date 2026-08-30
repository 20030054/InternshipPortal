import { afterEach, describe, expect, it } from "vitest";
import { POST as restartRequestRoute } from "@/app/api/cases/[id]/restart-request/route";
import { POST as countersignRoute } from "@/app/api/restart-requests/[id]/countersign/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createClosedIncompleteCase } from "./support/case-lifecycle";
import { submitOffer, approveOffer } from "@/server/offers/service";
import { completeInternship } from "@/server/progress/service";
import {
  advanceToVerificationIfReady,
  awardGrade,
  markVerified,
  recommendGrade,
  verifyDocument,
} from "@/server/grading/service";
import { storeDocument } from "@/server/documents/store";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import { validPdfFile } from "./support/files";
import { prisma } from "@/server/db/client";
import { countAuthorizedRestarts } from "@/server/restart/service";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Walks a case already sitting in ELIGIBLE (the restart's own linked
 * case) all the way through to CLOSED_INCOMPLETE, via the real M05/M07/
 * M09 service functions -- mirrors createClosedIncompleteCase()'s chain
 * but starting from an existing case/student pair instead of a fresh
 * eligible student. */
async function driveToClosedIncomplete(caseId: string, studentUserId: string, companyName: string) {
  const submitted = await submitOffer({
    caseId,
    actor: { userId: studentUserId, roles: ["STUDENT"] },
    companyName,
    companyContact: `hr@${companyName.toLowerCase().replace(/\s+/g, "")}.test`,
    workDescription: "y".repeat(200),
    offerLetterFile: validPdfFile(),
  });

  const focal = await createUserFixture();
  await assignRole(focal.id, "FOCAL");
  await approveOffer({
    caseId: submitted.id,
    actor: { userId: focal.id, roles: ["FOCAL"] },
    reason: "approved",
    plannedStart: new Date("2026-06-01"),
    plannedEnd: new Date("2026-07-13"),
    relevanceConfirmed: true,
  });
  await completeInternship({
    caseId: submitted.id,
    actor: { userId: studentUserId, roles: ["STUDENT"] },
    actualStart: new Date("2026-06-01"),
    actualEnd: new Date("2026-07-13"),
  });

  const completionCertificate = await storeDocument({
    caseId: submitted.id,
    type: "COMPLETION_CERTIFICATE",
    file: validPdfFile("certificate.pdf"),
    uploadedBy: studentUserId,
  });
  const { rawToken } = await issueSupervisorToken({
    caseId: submitted.id,
    supervisorEmail: `supervisor@${companyName.toLowerCase().replace(/\s+/g, "")}.test`,
    issuedBy: focal.id,
  });
  await submitEvaluation({ rawToken, performanceRating: 2, comments: "Below par." });
  await advanceToVerificationIfReady(submitted.id);

  const offerLetter = await prisma.document.findFirstOrThrow({
    where: { caseId: submitted.id, type: "OFFER_LETTER", status: "ACTIVE" },
  });
  await verifyDocument({ documentId: offerLetter.id, method: "DOCUMENT_INSPECTED", verifiedBy: focal.id });
  await verifyDocument({ documentId: completionCertificate.id, method: "DOCUMENT_INSPECTED", verifiedBy: focal.id });
  await markVerified({ caseId: submitted.id, actor: { userId: focal.id, roles: ["FOCAL"] } });

  await recommendGrade({
    caseId: submitted.id,
    actor: { userId: focal.id, roles: ["FOCAL"] },
    value: "I",
    reason: "incomplete again",
  });
  const hod = await createUserFixture();
  await assignRole(hod.id, "HOD");
  await awardGrade({
    caseId: submitted.id,
    actor: { userId: hod.id, roles: ["HOD"] },
    value: "I",
    reason: "confirmed",
  });

  return { caseId: submitted.id };
}

/** BR-19: at most RESTART_CAP (default 1) restarts before graduation --
 * a second restart attempt after one AUTHORIZED restart hits G4. */
describe("BR-19: restart cap", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a second restart attempt is denied once the cap (1) is reached", async () => {
    const { caseId: firstFailedCaseId, focalUserId, studentUserId } =
      await createClosedIncompleteCase(41500);
    await assignRole(focalUserId, "FOCAL");

    // First restart: succeeds.
    sessionState.current = { user: { id: focalUserId } };
    const firstRequestResponse = await restartRequestRoute(
      jsonRequest({
        newCompanyName: "Initech",
        newCompanyContact: "hr@initech.test",
        reason: "genuinely different placement",
      }),
      { params: Promise.resolve({ id: firstFailedCaseId }) },
    );
    const firstRequestBody = await firstRequestResponse.json();
    expect(firstRequestBody.outcome).toBe("PENDING");

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };
    const countersignResponse = await countersignRoute(
      jsonRequest({ reason: "confirmed" }),
      { params: Promise.resolve({ id: firstRequestBody.requestId }) },
    );
    expect(countersignResponse.status).toBe(200);
    const { newCase } = await countersignResponse.json();

    expect(await countAuthorizedRestarts(await studentIdFor(studentUserId))).toBe(1);

    // Drive the new (restarted) case to CLOSED_INCOMPLETE too.
    const { caseId: secondFailedCaseId } = await driveToClosedIncomplete(
      newCase.id,
      studentUserId,
      "Umbrella Corp",
    );

    // Second restart attempt: G4 must now reject it.
    sessionState.current = { user: { id: focalUserId } };
    const secondRequestResponse = await restartRequestRoute(
      jsonRequest({
        newCompanyName: "Hooli",
        newCompanyContact: "hr@hooli.test",
        reason: "a third placement",
      }),
      { params: Promise.resolve({ id: secondFailedCaseId }) },
    );
    expect(secondRequestResponse.status).toBe(201);
    const secondRequestBody = await secondRequestResponse.json();
    expect(secondRequestBody.outcome).toBe("DENIED");
    expect(secondRequestBody.reasons.join(" ")).toContain("G4");

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: secondFailedCaseId } });
    expect(kase.state).toBe("CLOSED_INCOMPLETE"); // never reached RESTART_REQUESTED
  });
});

async function studentIdFor(userId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({ where: { userId } });
  return student.id;
}
