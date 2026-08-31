import { afterEach, describe, expect, it, vi } from "vitest";
import { isGraduationEligible } from "@/server/roster/graduation";
import { GET as eligibilityRoute } from "@/app/api/students/[id]/eligibility/route";
import { sessionState } from "./setup";
import { assignRole, createStudentFixture, createUserFixture } from "./support/prisma-fixtures";
import { createVerifiedCase } from "./support/case-lifecycle";
import { awardGrade, recommendGrade } from "@/server/grading/service";
import { createCountersignedWaiver, createPendingWaiver } from "./support/waiver-fixtures";
import { approveWaiver } from "@/server/waivers/service";
import { prisma } from "@/server/db/client";

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

/**
 * BR-03: "A student cannot be marked graduation-eligible without a
 * CLOSED_PASS case or an approved waiver." A real gap found auditing
 * for M14's "every BR has a passing named test" done-criterion — no
 * prior module implemented this at all. See docs/modules/M14.md and
 * `src/server/roster/graduation.ts`.
 *
 * File naming, deliberately: `computeEligibility()` counts *every*
 * CLOSED semester in the database at or above a student's admission
 * point, globally, with no scoping beyond that — so any new CLOSED
 * semester this file creates would inflate every *other* test's own
 * eligibility/G2 math, for any test whose admission point is lower and
 * that runs *after* this file (this suite shares one live database,
 * `fileParallelism: false`, files run in filename order — see
 * vitest.integration.sequencer.ts). No numeric block, however high, an
 * earlier-sorting file could pick avoids this — a high block still
 * sits above every lower admission point used by files still to come
 * (confirmed the hard way: an initial attempt used a 42000 block, which
 * both collided directly with M13_student_dashboard.test.ts's own
 * 42010/42020 *and*, after being moved to 800,000,000 to "fix" that,
 * inflated M03_eligibility_route_ownership.test.ts's exact-count
 * assertion and several BR16-BR20/BR17-19/M13_dean_dashboard restart-
 * guard outcomes it shares no code with). The only structural fix is
 * running *after* every test that computes eligibility at all — hence
 * the `M14_` filename prefix ("M14" > every "BR"/"M0x"/"M1x" prefix,
 * < the lowercase `extra_constraints`/`schema`/`seed` sanity files,
 * none of which touch semester counts). Once nothing runs after this
 * file that cares, the exact `sequenceNumber` block stops being
 * safety-critical — 700,000,000+ here only to avoid colliding with an
 * exact value some earlier file already inserted (M13_dean_dashboard's
 * 500,000,000/M13_student_dashboard's 600,000,000 reservations).
 */
const BLOCK = 700_000_000;
describe("BR-03: graduation eligibility requires CLOSED_PASS or an approved waiver", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("is false for a student with no case and no waiver at all", async () => {
    const student = await createStudentFixture();
    expect(await isGraduationEligible(student.id)).toBe(false);
  });

  it("is true once a case reaches CLOSED_PASS", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(BLOCK);
    await recommendGrade({
      caseId,
      actor: { userId: focalUserId, roles: ["FOCAL"] },
      value: "P",
      reason: "all deliverables satisfactory",
    });
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    await awardGrade({
      caseId,
      actor: { userId: hod.id, roles: ["HOD"] },
      value: "P",
    });

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("CLOSED_PASS");
    expect(await isGraduationEligible(kase.studentId)).toBe(true);
  });

  it("is false while a case is CLOSED_INCOMPLETE — an 'I' grade is not a pass", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(BLOCK + 100);
    await recommendGrade({
      caseId,
      actor: { userId: focalUserId, roles: ["FOCAL"] },
      value: "I",
      reason: "deliverables did not meet the bar",
    });
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    await awardGrade({
      caseId,
      actor: { userId: hod.id, roles: ["HOD"] },
      value: "I",
      reason: "confirmed incomplete",
    });

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("CLOSED_INCOMPLETE");
    expect(await isGraduationEligible(kase.studentId)).toBe(false);
  });

  it("is true for a student with a GRANTED waiver, even with no CLOSED_PASS case", async () => {
    // BR-21: HoD countersign (WAIVER_REQUESTED -> WAIVER_COUNTERSIGNED)
    // must happen before the Dean's final ruling — approveWaiver() only
    // defines a transition out of WAIVER_COUNTERSIGNED, not straight
    // from WAIVER_REQUESTED.
    const base = await createCountersignedWaiver();
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    await approveWaiver({
      waiverId: base.waiverId,
      actor: { userId: dean.id, roles: ["DEAN"] },
      reason: "credible, exceptional circumstance confirmed",
    });

    expect(await isGraduationEligible(base.studentId)).toBe(true);
  });

  it("is false for a student whose waiver is still PENDING — not yet an approval", async () => {
    const base = await createPendingWaiver();
    expect(await isGraduationEligible(base.studentId)).toBe(false);
  });

  it("route: GET /api/students/:id/eligibility surfaces the real computed value, not a client-suppliable one", async () => {
    const { caseId, focalUserId } = await createVerifiedCase(BLOCK + 200);
    await recommendGrade({
      caseId,
      actor: { userId: focalUserId, roles: ["FOCAL"] },
      value: "P",
      reason: "all deliverables satisfactory",
    });
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    await awardGrade({
      caseId,
      actor: { userId: hod.id, roles: ["HOD"] },
      value: "P",
    });

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    const student = await prisma.student.findUniqueOrThrow({ where: { id: kase.studentId } });

    await assignRole(student.userId, "STUDENT");
    sessionState.current = { user: { id: student.userId } };

    const response = await eligibilityRoute(
      new Request(`http://test/api/students/${student.id}/eligibility`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // This is a GET with no client-supplied body — the route computes
    // fresh from the database on every call, matching what the direct
    // function call above returns for the same student.
    expect(body.isGraduationEligible).toBe(true);
  });
});
