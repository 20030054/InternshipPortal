import { assignRole, createStudentFixture, createUserFixture } from "./prisma-fixtures";
import { countersignWaiver, initiateWaiver } from "@/server/waivers/service";
import { validPdfFile } from "./files";

/** BR-22's floor, comfortably cleared. */
export const VALID_CIRCUMSTANCE =
  "The student was hospitalised for an extended period following a " +
  "serious medical emergency during the semester in which they would " +
  "otherwise have completed the internship requirement, and medical " +
  "documentation confirms they were unable to undertake any placement " +
  "for the entire remaining eligibility window as a direct result. " +
  "This is a genuinely exceptional circumstance, not ordinary prior " +
  "work experience, and is documented in the attached evidence.";

/** A fresh student with a real, service-created PENDING waiver — the
 * shape every countersign/deny/approve test needs to start from. Uses
 * `initiateWaiver()` directly (not the route) since these tests care
 * about what happens *after* initiation, mirroring M10's
 * `createClosedIncompleteCase()` convention. */
export async function createPendingWaiver() {
  const student = await createStudentFixture();
  await assignRole(student.userId, "STUDENT");
  const focal = await createUserFixture();
  await assignRole(focal.id, "FOCAL");

  const { case: kase, waiver } = await initiateWaiver({
    studentId: student.id,
    actor: { userId: focal.id, roles: ["FOCAL"] },
    circumstance: VALID_CIRCUMSTANCE,
    reason: "initiating on the student's behalf per documented policy",
    evidenceFile: validPdfFile("evidence.pdf"),
  });

  return { studentId: student.id, studentUserId: student.userId, focalUserId: focal.id, caseId: kase.id, waiverId: waiver.id };
}

/** Continues to WAIVER_COUNTERSIGNED via the real service call. */
export async function createCountersignedWaiver() {
  const base = await createPendingWaiver();
  const hod = await createUserFixture();
  await assignRole(hod.id, "HOD");
  await countersignWaiver({
    waiverId: base.waiverId,
    actor: { userId: hod.id, roles: ["HOD"] },
    reason: "reviewed and credible",
  });
  return { ...base, hodUserId: hod.id };
}
