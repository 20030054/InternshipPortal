import { describe, expect, it } from "vitest";
import { getHodDashboard } from "@/server/dashboards/hod-view";
import { createOfferUnderReviewCase, createEligibleStudent } from "./support/offer-fixtures";
import { createPendingWaiver } from "./support/waiver-fixtures";
import { createClosedIncompleteCase, createDocsPendingCase } from "./support/case-lifecycle";
import { requestRestart } from "@/server/restart/service";
import { assignRole } from "./support/prisma-fixtures";
import { storeDocument } from "@/server/documents/store";
import { issueSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import { advanceToVerificationIfReady } from "@/server/grading/service";
import { validPdfFile } from "./support/files";
import { prisma } from "@/server/db/client";

describe("M13: HoD department view", () => {
  it("counts by state include a real case's current state", async () => {
    const { caseId } = await createOfferUnderReviewCase(42300);
    const dashboard = await getHodDashboard();
    const row = dashboard.countsByState.find((r) => r.state === "OFFER_UNDER_REVIEW");
    expect(row).toBeDefined();
    expect(row!.count).toBeGreaterThanOrEqual(1);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("OFFER_UNDER_REVIEW"); // sanity: the fixture really is counted
  });

  it("overdue eligibility lists an eligible student with zero cases -- 'at risk of not graduating'", async () => {
    const student = await createEligibleStudent(42320);
    const dashboard = await getHodDashboard();
    expect(dashboard.overdueEligibility.map((r) => r.studentId)).toContain(student.id);
  });

  it("overdue eligibility never lists a student who already has a case", async () => {
    const { studentUserId } = await createOfferUnderReviewCase(42340);
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUserId } });
    const dashboard = await getHodDashboard();
    expect(dashboard.overdueEligibility.map((r) => r.studentId)).not.toContain(student.id);
  });

  it("pending verifications lists a case in PENDING_VERIFICATION", async () => {
    const { caseId, studentUserId, focalUserId } = await createDocsPendingCase(42360);
    await storeDocument({
      caseId,
      type: "COMPLETION_CERTIFICATE",
      file: validPdfFile("cert.pdf"),
      uploadedBy: studentUserId,
    });
    const { rawToken } = await issueSupervisorToken({
      caseId,
      supervisorEmail: "supervisor@acme.test",
      issuedBy: focalUserId,
    });
    await submitEvaluation({ rawToken, performanceRating: 5, comments: "Great." });
    await advanceToVerificationIfReady(caseId);

    const dashboard = await getHodDashboard();
    expect(dashboard.pendingVerifications.map((r) => r.caseId)).toContain(caseId);
  });

  it("waivers includes every waiver ever requested (BR-24: permanent visibility)", async () => {
    const { waiverId } = await createPendingWaiver();
    const dashboard = await getHodDashboard();
    expect(dashboard.waivers.map((w) => w.waiverId)).toContain(waiverId);
  });

  it("restarts includes a real restart request", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(42380);
    await assignRole(focalUserId, "FOCAL");
    const result = await requestRestart({
      caseId,
      actor: { userId: focalUserId, roles: ["FOCAL"] },
      newCompanyName: "Globex Dashboard Inc",
      newCompanyContact: "hr@globexdash.test",
      reason: "genuinely different placement",
    });

    const dashboard = await getHodDashboard();
    expect(dashboard.restarts.map((r) => r.requestId)).toContain(result.request.id);
  });
});
