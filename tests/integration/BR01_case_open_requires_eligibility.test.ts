import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import {
  AlreadyHasActiveCaseError,
  NotEligibleError,
  openCase,
} from "@/server/offers/service";
import { createStudentFixture } from "./support/prisma-fixtures";
import { createEligibleStudent } from "./support/offer-fixtures";

/**
 * BR-01, wired for real for the first time (OQ-11) — see
 * docs/modules/M05.md. `openCase()` computes eligibility via M03's
 * computeEligibility() and only then calls the M04 executor, so this
 * doubles as proof that ELIGIBILITY_PENDING -> ELIGIBLE now has a real
 * caller.
 */
describe("BR-01: case.open requires computed eligibility", () => {
  it("an ineligible student's openCase() throws and creates no case row", async () => {
    // A brand-new student (admission semester itself not CLOSED yet) has
    // completed 0 semesters -- not eligible.
    const student = await createStudentFixture();

    await expect(openCase(student.id)).rejects.toBeInstanceOf(NotEligibleError);

    const cases = await prisma.case.findMany({ where: { studentId: student.id } });
    expect(cases).toHaveLength(0);
  });

  it("an eligible student's openCase() lands the case on ELIGIBLE via a real transition", async () => {
    const student = await createEligibleStudent(1000);

    const kase = await openCase(student.id);
    expect(kase.state).toBe("ELIGIBLE");

    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId: kase.id },
    });
    expect(event.fromState).toBe("ELIGIBILITY_PENDING");
    expect(event.toState).toBe("ELIGIBLE");
    expect(event.systemJob).toBe("case-open");

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "case", entityId: kase.id, eventType: "ELIGIBILITY_CONFIRMED" },
    });
    expect(audit.systemJob).toBe("case-open");
  });

  it("a second openCase() for the same student is rejected (BR-06)", async () => {
    const student = await createEligibleStudent(1010);
    await openCase(student.id);

    await expect(openCase(student.id)).rejects.toBeInstanceOf(AlreadyHasActiveCaseError);
  });
});
