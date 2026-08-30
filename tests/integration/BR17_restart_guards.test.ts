import { afterEach, describe, expect, it } from "vitest";
import { POST as restartRequestRoute } from "@/app/api/cases/[id]/restart-request/route";
import { POST as countersignRoute } from "@/app/api/restart-requests/[id]/countersign/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createClosedSemesterChain,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";
import { createClosedIncompleteCase } from "./support/case-lifecycle";
import { openCase, submitOffer, approveOffer } from "@/server/offers/service";
import { completeInternship } from "@/server/progress/service";
import { recommendGrade, awardGrade } from "@/server/grading/service";
import { storeDocument } from "@/server/documents/store";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import { advanceToVerificationIfReady, markVerified, verifyDocument } from "@/server/grading/service";
import { validPdfFile } from "./support/files";
import { prisma } from "@/server/db/client";

/**
 * All of M10's test files (BR16-BR20 through M10_restart_gate_capabilities)
 * share the 41000-41999 block, deliberately -- not the usual "low
 * thousands" tier every earlier BR0x/M0x-content test uses. G2 needs an
 * *upper*-bounded count (semestersRemaining < 1 must be reachable), not
 * just a boolean threshold, so this is the first module for which
 * computeEligibility()'s DB-wide "every CLOSED semester at or above
 * admission" counting actually bites in both directions:
 *   - Below 41000 (the low-thousands tier) would get inflated by
 *     BR02_auto_enrollment_sweep.test.ts's 10_000/20_000/30_000/40_000
 *     chains (ceiling 40_004), which run before this file alphabetically
 *     ("BR02" < "BR16") and are already in the database by the time
 *     these tests run.
 *   - 50000+ would inflate M03_eligibility_route_ownership.test.ts's own
 *     exact-count assertions (its blocks start at 50_000) once that file
 *     runs ("BR16" < "M03", so this file's semesters already exist by
 *     then).
 * 41000-49999 is the one open window between those two neighbours. See
 * DECISIONS.md D-064.
 */

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function requestRestart(caseId: string, focalUserId: string, body: unknown) {
  sessionState.current = { user: { id: focalUserId } };
  const response = await restartRequestRoute(jsonRequest(body), {
    params: Promise.resolve({ id: caseId }),
  });
  return { response, body: await response.json() };
}

/** BR-17: G1 (different organisation, exact + fuzzy), G2 (time remains),
 * G5 (distinct signers). G4 (cap) has its own file, BR19. */
describe("BR-17: G1 different organisation", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("G1 exact name match denies at request time, with a DENIED request row on record", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(41100);
    await assignRole(focalUserId, "FOCAL");

    const { response, body } = await requestRestart(caseId, focalUserId, {
      newCompanyName: "Acme Corp", // same as the failed case's company
      newCompanyContact: "hr@acme.test",
      reason: "attempt",
    });
    expect(response.status).toBe(201);
    expect(body.outcome).toBe("DENIED");
    expect(body.reasons.join(" ")).toContain("G1");

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("CLOSED_INCOMPLETE"); // never even reached RESTART_REQUESTED

    const stored = await prisma.restartRequest.findUniqueOrThrow({ where: { id: body.requestId } });
    expect(stored.outcome).toBe("DENIED");
  });

  it("G1 exact registration-number match denies even with a different name", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(41120);
    await assignRole(focalUserId, "FOCAL");

    const failedCase = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { companyId: true },
    });
    await prisma.company.update({
      where: { id: failedCase.companyId! },
      data: { registrationNumber: "NTN-41120" },
    });

    const { response, body } = await requestRestart(caseId, focalUserId, {
      newCompanyName: "Totally Different Holdings",
      newCompanyContact: "hr@different.test",
      newCompanyRegistrationNumber: "NTN-41120",
      reason: "attempt",
    });
    expect(response.status).toBe(201);
    expect(body.outcome).toBe("DENIED");
    expect(body.reasons.join(" ")).toContain("registration number");
  });

  it("G1 flagged (fuzzy, above threshold, not exact) requires HoD override to countersign", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(41140);
    await assignRole(focalUserId, "FOCAL");

    const { response, body } = await requestRestart(caseId, focalUserId, {
      newCompanyName: "Acme Corp2", // similarity ~0.9 against "Acme Corp", not exact
      newCompanyContact: "hr@acmecorp2.test",
      reason: "a plausible new placement",
    });
    expect(response.status).toBe(201);
    expect(body.outcome).toBe("PENDING"); // flagged doesn't block the request itself

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const withoutAck = await countersignRoute(
      jsonRequest({ reason: "looks fine to me" }),
      { params: Promise.resolve({ id: body.requestId }) },
    );
    expect(withoutAck.status).toBe(400);

    const withAck = await countersignRoute(
      jsonRequest({ reason: "reviewed the flagged match, genuinely distinct entity", acknowledgeFlaggedMatch: true }),
      { params: Promise.resolve({ id: body.requestId }) },
    );
    expect(withAck.status).toBe(200);
  });

  it("a clean non-matching name is neither exact nor flagged, and needs no override", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(41160);
    await assignRole(focalUserId, "FOCAL");

    const { response, body } = await requestRestart(caseId, focalUserId, {
      newCompanyName: "Globex Inc",
      newCompanyContact: "hr@globex.test",
      reason: "different company entirely",
    });
    expect(response.status).toBe(201);
    expect(body.outcome).toBe("PENDING");

    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };
    const countersign = await countersignRoute(jsonRequest({ reason: "confirmed" }), {
      params: Promise.resolve({ id: body.requestId }),
    });
    expect(countersign.status).toBe(200); // no acknowledgeFlaggedMatch needed
  });
});

describe("BR-17: G2 time remains", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  /** Builds a CLOSED_INCOMPLETE case for a student with 8 CLOSED
   * semesters at/after admission — GRADUATION_BOUNDARY_SEMESTERS itself,
   * so semestersRemaining is 0 and G2 must fail. Doesn't reuse
   * createClosedIncompleteCase()'s chain (fixed at 4 semesters) since
   * this is the one test in the suite that needs an exact, different
   * count. */
  async function createCaseAtGraduationBoundary(startSequence: number) {
    const semesters = await createClosedSemesterChain(8, startSequence);
    const student = await createStudentFixture({ admissionSemesterId: semesters[0]!.id });
    await assignRole(student.userId, "STUDENT");

    const kase = await openCase(student.id);
    const submitted = await submitOffer({
      caseId: kase.id,
      actor: { userId: student.userId, roles: ["STUDENT"] },
      companyName: "Acme Corp",
      companyContact: "hr@acme.test",
      workDescription: "x".repeat(200),
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
      actor: { userId: student.userId, roles: ["STUDENT"] },
      actualStart: new Date("2026-06-01"),
      actualEnd: new Date("2026-07-13"),
    });

    const completionCertificate = await storeDocument({
      caseId: submitted.id,
      type: "COMPLETION_CERTIFICATE",
      file: validPdfFile("certificate.pdf"),
      uploadedBy: student.userId,
    });
    const { rawToken } = await issueSupervisorToken({
      caseId: submitted.id,
      supervisorEmail: "supervisor@acme.test",
      issuedBy: focal.id,
    });
    await submitEvaluation({ rawToken, performanceRating: 3, comments: "Adequate." });
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
      reason: "incomplete",
    });
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    await awardGrade({
      caseId: submitted.id,
      actor: { userId: hod.id, roles: ["HOD"] },
      value: "I",
      reason: "confirmed",
    });

    return { caseId: submitted.id, focalUserId: focal.id };
  }

  it("denies when semestersRemaining is 0 (right at the graduation boundary)", async () => {
    const { caseId, focalUserId } = await createCaseAtGraduationBoundary(41180);

    const { response, body } = await requestRestart(caseId, focalUserId, {
      newCompanyName: "Globex Inc",
      newCompanyContact: "hr@globex.test",
      reason: "attempt",
    });
    expect(response.status).toBe(201);
    expect(body.outcome).toBe("DENIED");
    expect(body.reasons.join(" ")).toContain("G2");
  });
});

describe("BR-17: G5 distinct signers", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("rejects a same-account countersign attempt without denying the request", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(41220);
    await assignRole(focalUserId, "FOCAL");
    await assignRole(focalUserId, "HOD"); // same account also holds HOD, for this test only

    const { body } = await requestRestart(caseId, focalUserId, {
      newCompanyName: "Globex Inc",
      newCompanyContact: "hr@globex.test",
      reason: "attempt",
    });
    expect(body.outcome).toBe("PENDING");

    sessionState.current = { user: { id: focalUserId } }; // same account counter-signs
    const response = await countersignRoute(jsonRequest({ reason: "self sign-off" }), {
      params: Promise.resolve({ id: body.requestId }),
    });
    expect(response.status).toBe(409);

    // request stays PENDING -- open for a genuinely distinct HoD account
    const stored = await prisma.restartRequest.findUniqueOrThrow({ where: { id: body.requestId } });
    expect(stored.outcome).toBe("PENDING");

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("RESTART_REQUESTED"); // not denied, still open

    const otherHod = await createUserFixture();
    await assignRole(otherHod.id, "HOD");
    sessionState.current = { user: { id: otherHod.id } };
    const retried = await countersignRoute(jsonRequest({ reason: "distinct HoD account" }), {
      params: Promise.resolve({ id: body.requestId }),
    });
    expect(retried.status).toBe(200);
  });
});
