import { describe, expect, it } from "vitest";
import {
  AlreadyHasActiveCaseError,
  CannotReopenError,
  openCase,
} from "@/server/offers/service";
import { createCaseFixture } from "./support/prisma-fixtures";
import { createEligibleStudent } from "./support/offer-fixtures";

/**
 * BR-06, beyond what M01/M04's partial index alone enforces (see
 * docs/modules/M05.md "Scope decisions"): the index only blocks a
 * second *non-terminal* case. `openCase()` additionally blocks
 * re-opening from any terminal state except WITHDRAWN, so a student
 * can't route around the restart gate (M10) with a plain re-open, or
 * open a pointless second case after already passing.
 */
describe("BR-06: openCase() after a terminal case", () => {
  const blockedStates = [
    "CLOSED_PASS",
    "CLOSED_INCOMPLETE",
    "RESTART_DENIED",
    "RESTART_AUTHORIZED",
  ] as const;

  it.each(blockedStates)("blocks re-opening from %s", async (state) => {
    const student = await createEligibleStudent(1500 + blockedStates.indexOf(state) * 10);
    await createCaseFixture({ studentId: student.id, state });

    const err = await openCase(student.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CannotReopenError);
    expect((err as CannotReopenError).state).toBe(state);
  });

  it("allows re-opening from WITHDRAWN", async () => {
    const student = await createEligibleStudent(1550);
    await createCaseFixture({ studentId: student.id, state: "WITHDRAWN" });

    const kase = await openCase(student.id);
    expect(kase.state).toBe("ELIGIBLE");
  });

  it("still blocks on a non-terminal existing case before reaching the terminal-state check", async () => {
    const student = await createEligibleStudent(1560);
    await createCaseFixture({ studentId: student.id, state: "OFFER_UNDER_REVIEW" });

    await expect(openCase(student.id)).rejects.toBeInstanceOf(AlreadyHasActiveCaseError);
  });
});
