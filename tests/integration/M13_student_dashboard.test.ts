import { describe, expect, it } from "vitest";
import { getStudentDashboard } from "@/server/dashboards/student-view";
import {
  createClosedSemesterChain,
  createStudentFixture,
} from "./support/prisma-fixtures";
import { createOfferUnderReviewCase, createEligibleStudent } from "./support/offer-fixtures";
import { approveOffer } from "@/server/offers/service";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { executeTransition } from "@/server/state-machine/executor";
import { prisma } from "@/server/db/client";
import { createCountersignedWaiver } from "./support/waiver-fixtures";
import { approveWaiver } from "@/server/waivers/service";

describe("M13: student dashboard (the eight-step progress line's data)", () => {
  it("a student with zero cases and fewer than 4 closed semesters is not eligible", async () => {
    // A dedicated, isolated high block, not the low 42000s family the
    // rest of this file/module shares -- this is the one M13 test whose
    // own assertion needs an exact, *upper*-bounded semester count
    // (isEligible: false requires staying under 4), so it's vulnerable
    // to every other test's semesters at or above its own admission
    // point the same way D-064 already documents for M10. Every other
    // M13 test only ever checks isEligible: true, a one-directional
    // threshold immune to over-counting, so it doesn't need this.
    //
    // 95000 alone isn't high enough: this file sorts after "M03_...",
    // whose own semester_admin_routes test assigns sequence numbers via
    // production's own nextSequenceNumber() ("always above the current
    // global max") -- observed reaching into the tens of millions in a
    // real run, since it compounds on top of createSemesterFixture()'s
    // own random 100k-1M default range. 600 million is comfortably
    // below Postgres INTEGER's ~2.1 billion ceiling and far above
    // anything that mechanism could plausibly reach in one run. See
    // DECISIONS.md D-079.
    const semesters = await createClosedSemesterChain(2, 600_000_000);
    const student = await createStudentFixture({ admissionSemesterId: semesters[0]!.id });

    const dashboard = await getStudentDashboard(student.id);
    expect(dashboard).toEqual({
      status: "no_case",
      isEligible: false,
      isGraduationEligible: false,
    });
  });

  it("a student with zero cases and 4+ closed semesters is eligible", async () => {
    const student = await createEligibleStudent(42010);

    const dashboard = await getStudentDashboard(student.id);
    expect(dashboard).toEqual({
      status: "no_case",
      isEligible: true,
      isGraduationEligible: false,
    });
  });

  it("a student with a live case renders that case's own progress", async () => {
    const { caseId, studentUserId } = await createOfferUnderReviewCase(42020);
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUserId } });

    const dashboard = await getStudentDashboard(student.id);
    expect(dashboard.status).toBe("has_case");
    if (dashboard.status !== "has_case") return;
    expect(dashboard.caseId).toBe(caseId);
    expect(dashboard.companyName).toBe("Acme Corp");
    expect(dashboard.progress.type).toBe("normal");
    if (dashboard.progress.type === "normal") {
      expect(dashboard.progress.currentStep).toBe(4);
    }
  });

  it("shows the most recent case when a student has more than one (e.g. after a restart)", async () => {
    const { caseId: firstCaseId, studentUserId } = await createOfferUnderReviewCase(42030);
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUserId } });

    // cases_one_nonterminal_per_student (M01) blocks a second
    // non-terminal case for the same student -- the first must reach a
    // real terminal state first. Withdrawal (a genuine, student-actor
    // transition) is the simplest one to reach directly here.
    await executeTransition(
      firstCaseId,
      "WITHDRAWN",
      { type: "user", userId: studentUserId, roles: ["STUDENT"] },
      { reason: "no longer pursuing this placement" },
    );

    // A second, newer case for the same student -- genesis insert, same
    // shape a restart's linked case would take (M10).
    const secondCase = await prisma.case.create({
      data: { studentId: student.id, state: "ELIGIBLE" },
    });

    const dashboard = await getStudentDashboard(student.id);
    expect(dashboard.status).toBe("has_case");
    if (dashboard.status !== "has_case") return;
    expect(dashboard.caseId).toBe(secondCase.id);
    expect(dashboard.caseId).not.toBe(firstCaseId);
  });

  it("reflects a live transition immediately (approval moves the progress line)", async () => {
    const { caseId, studentUserId } = await createOfferUnderReviewCase(42040);
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    await approveOffer({
      caseId,
      actor: { userId: focal.id, roles: ["FOCAL"] },
      reason: "approved",
      plannedStart: new Date("2026-06-01"),
      plannedEnd: new Date("2026-07-13"),
      relevanceConfirmed: true,
    });
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUserId } });

    const dashboard = await getStudentDashboard(student.id);
    expect(dashboard.status).toBe("has_case");
    if (dashboard.status !== "has_case") return;
    // approveOffer() auto-chains APPROVED -> IN_PROGRESS (M05).
    expect(dashboard.progress.type).toBe("normal");
    if (dashboard.progress.type === "normal") {
      expect(dashboard.progress.currentStep).toBe(5);
    }
    expect(dashboard.plannedStart).not.toBeNull();
  });

  // M15: `isGraduationEligible` (BR-03, M14) had no dashboard caller at
  // all until this pass — see docs/DECISIONS.md D-117. The waiver path
  // is used here specifically because, unlike a real case-to-
  // CLOSED_PASS lifecycle, it needs no new semester fixtures (BR-21:
  // "the only route that skips the eight steps entirely"), so this
  // stays immune to the exact-semester-count fragility
  // M14_BR03_graduation_eligibility.test.ts's own file-naming
  // convention documents in detail.
  it("surfaces isGraduationEligible: true once a waiver is granted", async () => {
    const { studentId, waiverId } = await createCountersignedWaiver();
    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    await approveWaiver({
      waiverId,
      actor: { userId: dean.id, roles: ["DEAN"] },
      reason: "credible and confirmed",
    });

    const dashboard = await getStudentDashboard(studentId);
    expect(dashboard.isGraduationEligible).toBe(true);
  });
});
