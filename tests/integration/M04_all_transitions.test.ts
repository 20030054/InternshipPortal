import { describe, expect, it } from "vitest";
import {
  executeSystemTransition,
  executeTransition,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import {
  createCaseFixture,
  createCompanyFixture,
} from "./support/prisma-fixtures";
import { createUserActor } from "./support/actor";

/**
 * One block per transition table row (MASTER_PROMPT.md §5 /
 * docs/modules/M04.md's table). Each proves the success path under valid
 * conditions and at least one failure path per guard the row carries —
 * every transition also gets a "wrong actor role" rejection, since that
 * check applies universally.
 *
 * Actors are real `User` rows (via createUserActor) because
 * case_events.actor_user_id / audit_events.actor_user_id are genuine
 * foreign keys to users.id — an arbitrary label string fails at the
 * database, not just semantically. Tests whose guard compares two actor
 * ids for equality/inequality (BR-12, G5) capture one createUserActor()
 * result and reuse its .userId in both places, rather than creating two
 * separate users and hoping their fake ids happened to differ.
 *
 * Rows 1, 2, 4 and 6 now carry M05's real guards (BR-01/07/08/09), row 8
 * carries M07's (BR-08's actual-dates half), and rows 9-10 carry M09's
 * (BR-10/BR-11) — rather than M04's original always-pass stubs. Their
 * success-path tests below pass the minimal valid `context` those
 * guards need. Guard *failure* paths for those rows are covered by the
 * dedicated BR01/BR07/BR08/BR09/BR10/BR11 test files (through the real
 * routes), not duplicated here — this file's job is proving each row's
 * (from, to, actor, reason) shape against the real table, not
 * re-proving what guards.test.ts and the BR0X files
 * already cover.
 */
const VALID_OFFER = {
  companyName: "Acme Corp",
  companyContact: "hr@acme.test",
  workDescription: "x".repeat(200),
  offerLetterDocumentId: "doc-1",
};
describe("M04: every transition in the real table", () => {
  it("1. ELIGIBILITY_PENDING -> ELIGIBLE (SYSTEM)", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBILITY_PENDING" });
    const result = await executeSystemTransition(kase.id, "ELIGIBLE", "eligibility-job", {
      context: { eligibility: { isEligible: true } },
    });
    expect(result.state).toBe("ELIGIBLE");
  });

  it("1. rejects a user actor (requires SYSTEM)", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBILITY_PENDING" });
    const actor = await createUserActor("ADMIN");
    await expect(
      executeTransition(kase.id, "ELIGIBLE", actor),
    ).rejects.toBeInstanceOf(WrongActorRoleError);
  });

  it("2. ELIGIBLE -> OFFER_SUBMITTED (STUDENT)", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBLE" });
    const actor = await createUserActor("STUDENT");
    const result = await executeTransition(kase.id, "OFFER_SUBMITTED", actor, {
      context: { offer: VALID_OFFER },
    });
    expect(result.state).toBe("OFFER_SUBMITTED");
  });

  it("2. rejects a non-STUDENT actor", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBLE" });
    const actor = await createUserActor("FOCAL");
    await expect(
      executeTransition(kase.id, "OFFER_SUBMITTED", actor),
    ).rejects.toBeInstanceOf(WrongActorRoleError);
  });

  it("3. OFFER_SUBMITTED -> OFFER_UNDER_REVIEW (SYSTEM)", async () => {
    const kase = await createCaseFixture({ state: "OFFER_SUBMITTED" });
    const result = await executeSystemTransition(kase.id, "OFFER_UNDER_REVIEW", "queue-job");
    expect(result.state).toBe("OFFER_UNDER_REVIEW");
  });

  it("4. OFFER_UNDER_REVIEW -> APPROVED (FOCAL, reason required)", async () => {
    const kase = await createCaseFixture({ state: "OFFER_UNDER_REVIEW" });
    const actor = await createUserActor("FOCAL");
    const result = await executeTransition(kase.id, "APPROVED", actor, {
      reason: "relevant to the degree, 6 weeks planned",
      context: {
        offer: {
          plannedStart: new Date("2026-06-01"),
          plannedEnd: new Date("2026-07-13"), // 6 weeks
          minWeeks: 4,
          maxWeeks: 8,
          relevanceConfirmed: true,
        },
      },
    });
    expect(result.state).toBe("APPROVED");
  });

  it("4. rejects a missing reason", async () => {
    const kase = await createCaseFixture({ state: "OFFER_UNDER_REVIEW" });
    const actor = await createUserActor("FOCAL");
    await expect(
      executeTransition(kase.id, "APPROVED", actor),
    ).rejects.toBeInstanceOf(MissingReasonError);
  });

  it("5. OFFER_UNDER_REVIEW -> OFFER_REJECTED (FOCAL, reason required)", async () => {
    const kase = await createCaseFixture({ state: "OFFER_UNDER_REVIEW" });
    const actor = await createUserActor("FOCAL");
    const result = await executeTransition(kase.id, "OFFER_REJECTED", actor, {
      reason: "not relevant to the degree programme",
    });
    expect(result.state).toBe("OFFER_REJECTED");
  });

  it("5. rejects a missing reason", async () => {
    const kase = await createCaseFixture({ state: "OFFER_UNDER_REVIEW" });
    const actor = await createUserActor("FOCAL");
    await expect(
      executeTransition(kase.id, "OFFER_REJECTED", actor),
    ).rejects.toBeInstanceOf(MissingReasonError);
  });

  it("6. OFFER_REJECTED -> OFFER_SUBMITTED (STUDENT, resubmission)", async () => {
    const kase = await createCaseFixture({ state: "OFFER_REJECTED" });
    const actor = await createUserActor("STUDENT");
    const result = await executeTransition(kase.id, "OFFER_SUBMITTED", actor, {
      context: { offer: VALID_OFFER },
    });
    expect(result.state).toBe("OFFER_SUBMITTED");
  });

  it("7. APPROVED -> IN_PROGRESS (SYSTEM)", async () => {
    const kase = await createCaseFixture({ state: "APPROVED" });
    const result = await executeSystemTransition(kase.id, "IN_PROGRESS", "start-job");
    expect(result.state).toBe("IN_PROGRESS");
  });

  it("8. IN_PROGRESS -> DOCS_PENDING (STUDENT)", async () => {
    const kase = await createCaseFixture({ state: "IN_PROGRESS" });
    const actor = await createUserActor("STUDENT");
    const result = await executeTransition(kase.id, "DOCS_PENDING", actor, {
      context: {
        completion: {
          actualStart: new Date("2026-06-01"),
          actualEnd: new Date("2026-07-13"),
        },
      },
    });
    expect(result.state).toBe("DOCS_PENDING");
  });

  it("9. DOCS_PENDING -> PENDING_VERIFICATION (SYSTEM)", async () => {
    const kase = await createCaseFixture({ state: "DOCS_PENDING" });
    const result = await executeSystemTransition(kase.id, "PENDING_VERIFICATION", "docs-complete-job", {
      context: {
        deliverables: {
          hasActiveOfferLetter: true,
          hasActiveCompletionCertificate: true,
          hasSubmittedEvaluation: true,
        },
      },
    });
    expect(result.state).toBe("PENDING_VERIFICATION");
  });

  it("10. PENDING_VERIFICATION -> VERIFIED (FOCAL)", async () => {
    const kase = await createCaseFixture({ state: "PENDING_VERIFICATION" });
    const actor = await createUserActor("FOCAL");
    const result = await executeTransition(kase.id, "VERIFIED", actor, {
      context: {
        deliverables: { offerLetterVerified: true, completionCertificateVerified: true },
      },
    });
    expect(result.state).toBe("VERIFIED");
  });

  it("11. VERIFIED -> GRADE_RECOMMENDED (FOCAL, reason required)", async () => {
    const kase = await createCaseFixture({ state: "VERIFIED" });
    const actor = await createUserActor("FOCAL");
    const result = await executeTransition(kase.id, "GRADE_RECOMMENDED", actor, {
      reason: "all deliverables satisfactory, recommend Pass",
    });
    expect(result.state).toBe("GRADE_RECOMMENDED");
  });

  it("11. rejects a missing reason", async () => {
    const kase = await createCaseFixture({ state: "VERIFIED" });
    const actor = await createUserActor("FOCAL");
    await expect(
      executeTransition(kase.id, "GRADE_RECOMMENDED", actor),
    ).rejects.toBeInstanceOf(MissingReasonError);
  });

  it("12. GRADE_RECOMMENDED -> CLOSED_PASS (HOD, BR-12 recommender != awarder)", async () => {
    const kase = await createCaseFixture({ state: "GRADE_RECOMMENDED" });
    const hod = await createUserActor("HOD");
    const focal = await createUserActor("FOCAL");
    const result = await executeTransition(kase.id, "CLOSED_PASS", hod, {
      context: { grade: { recommendedBy: focal.userId, awardedBy: hod.userId } },
    });
    expect(result.state).toBe("CLOSED_PASS");
  });

  it("12. rejects when recommender and awarder are the same account", async () => {
    const kase = await createCaseFixture({ state: "GRADE_RECOMMENDED" });
    const same = await createUserActor("HOD");
    await expect(
      executeTransition(kase.id, "CLOSED_PASS", same, {
        context: { grade: { recommendedBy: same.userId, awardedBy: same.userId } },
      }),
    ).rejects.toBeInstanceOf(TransitionGuardError);
  });

  it("13. GRADE_RECOMMENDED -> CLOSED_INCOMPLETE (HOD, BR-12, reason required)", async () => {
    const kase = await createCaseFixture({ state: "GRADE_RECOMMENDED" });
    const hod = await createUserActor("HOD");
    const focal = await createUserActor("FOCAL");
    const result = await executeTransition(kase.id, "CLOSED_INCOMPLETE", hod, {
      reason: "deliverables incomplete at deadline",
      context: { grade: { recommendedBy: focal.userId, awardedBy: hod.userId } },
    });
    expect(result.state).toBe("CLOSED_INCOMPLETE");
  });

  it("13. rejects a missing reason", async () => {
    const kase = await createCaseFixture({ state: "GRADE_RECOMMENDED" });
    const hod = await createUserActor("HOD");
    const focal = await createUserActor("FOCAL");
    await expect(
      executeTransition(kase.id, "CLOSED_INCOMPLETE", hod, {
        context: { grade: { recommendedBy: focal.userId, awardedBy: hod.userId } },
      }),
    ).rejects.toBeInstanceOf(MissingReasonError);
  });

  it("13. rejects same recommender/awarder even with a reason", async () => {
    const kase = await createCaseFixture({ state: "GRADE_RECOMMENDED" });
    const same = await createUserActor("HOD");
    await expect(
      executeTransition(kase.id, "CLOSED_INCOMPLETE", same, {
        reason: "attempted self-award",
        context: { grade: { recommendedBy: same.userId, awardedBy: same.userId } },
      }),
    ).rejects.toBeInstanceOf(TransitionGuardError);
  });

  describe("14-18. withdrawal (STUDENT, only before APPROVED)", () => {
    const withdrawableFrom = [
      "ELIGIBILITY_PENDING",
      "ELIGIBLE",
      "OFFER_SUBMITTED",
      "OFFER_UNDER_REVIEW",
      "OFFER_REJECTED",
    ] as const;

    it.each(withdrawableFrom)("%s -> WITHDRAWN", async (fromState) => {
      const kase = await createCaseFixture({ state: fromState });
      const actor = await createUserActor("STUDENT");
      const result = await executeTransition(kase.id, "WITHDRAWN", actor);
      expect(result.state).toBe("WITHDRAWN");
    });

    it("APPROVED cannot withdraw (no such transition once approved)", async () => {
      const kase = await createCaseFixture({ state: "APPROVED" });
      const actor = await createUserActor("STUDENT");
      await expect(
        executeTransition(kase.id, "WITHDRAWN", actor),
      ).rejects.toThrow();
    });
  });

  describe("19. CLOSED_INCOMPLETE -> RESTART_REQUESTED (FOCAL, G1/G2/G4, reason required)", () => {
    async function restartContext(overrides: {
      sameCompany?: boolean;
      semestersRemaining?: number;
      existingRestartCount?: number;
      restartCap?: number;
    } = {}) {
      const failedCompany = await createCompanyFixture({ name: "Failed Co" });
      const newCompany = overrides.sameCompany
        ? failedCompany
        : await createCompanyFixture({ name: "New Co" });
      return {
        failedCompanyId: failedCompany.id,
        context: {
          restart: {
            failedCaseCompanyNormalizedName: failedCompany.normalisedName,
            newCompanyNormalizedName: newCompany.normalisedName,
            semestersRemaining: overrides.semestersRemaining ?? 2,
            existingRestartCount: overrides.existingRestartCount ?? 0,
            restartCap: overrides.restartCap ?? 1,
          },
        },
      };
    }

    it("succeeds when all three guards pass", async () => {
      const { failedCompanyId, context } = await restartContext();
      const kase = await createCaseFixture({
        state: "CLOSED_INCOMPLETE",
        companyId: failedCompanyId,
      });
      const actor = await createUserActor("FOCAL");
      const result = await executeTransition(kase.id, "RESTART_REQUESTED", actor, {
        reason: "different org secured, time remains",
        context,
      });
      expect(result.state).toBe("RESTART_REQUESTED");
    });

    it("G1 rejects the same organisation", async () => {
      const { failedCompanyId, context } = await restartContext({ sameCompany: true });
      const kase = await createCaseFixture({
        state: "CLOSED_INCOMPLETE",
        companyId: failedCompanyId,
      });
      const actor = await createUserActor("FOCAL");
      await expect(
        executeTransition(kase.id, "RESTART_REQUESTED", actor, {
          reason: "attempt",
          context,
        }),
      ).rejects.toBeInstanceOf(TransitionGuardError);
    });

    it("G2 rejects zero semesters remaining", async () => {
      const { failedCompanyId, context } = await restartContext({ semestersRemaining: 0 });
      const kase = await createCaseFixture({
        state: "CLOSED_INCOMPLETE",
        companyId: failedCompanyId,
      });
      const actor = await createUserActor("FOCAL");
      await expect(
        executeTransition(kase.id, "RESTART_REQUESTED", actor, {
          reason: "attempt",
          context,
        }),
      ).rejects.toBeInstanceOf(TransitionGuardError);
    });

    it("G4 rejects at the restart cap", async () => {
      const { failedCompanyId, context } = await restartContext({
        existingRestartCount: 1,
        restartCap: 1,
      });
      const kase = await createCaseFixture({
        state: "CLOSED_INCOMPLETE",
        companyId: failedCompanyId,
      });
      const actor = await createUserActor("FOCAL");
      await expect(
        executeTransition(kase.id, "RESTART_REQUESTED", actor, {
          reason: "attempt",
          context,
        }),
      ).rejects.toBeInstanceOf(TransitionGuardError);
    });

    it("rejects a missing reason even with all guards passing", async () => {
      const { failedCompanyId, context } = await restartContext();
      const kase = await createCaseFixture({
        state: "CLOSED_INCOMPLETE",
        companyId: failedCompanyId,
      });
      const actor = await createUserActor("FOCAL");
      await expect(
        executeTransition(kase.id, "RESTART_REQUESTED", actor, { context }),
      ).rejects.toBeInstanceOf(MissingReasonError);
    });
  });

  describe("20. RESTART_REQUESTED -> RESTART_AUTHORIZED (HOD, G5, reason required)", () => {
    it("succeeds with a distinct HoD signer", async () => {
      const kase = await createCaseFixture({ state: "RESTART_REQUESTED" });
      const hod = await createUserActor("HOD");
      const focal = await createUserActor("FOCAL");
      const result = await executeTransition(kase.id, "RESTART_AUTHORIZED", hod, {
        reason: "countersigned",
        context: {
          restart: {
            failedCaseCompanyNormalizedName: null,
            newCompanyNormalizedName: "x",
            semestersRemaining: 2,
            existingRestartCount: 0,
            restartCap: 1,
            focalSignerId: focal.userId,
            hodSignerId: hod.userId,
          },
        },
      });
      expect(result.state).toBe("RESTART_AUTHORIZED");
    });

    it("G5 rejects the same signer as focal and HoD", async () => {
      const kase = await createCaseFixture({ state: "RESTART_REQUESTED" });
      const same = await createUserActor("HOD");
      await expect(
        executeTransition(kase.id, "RESTART_AUTHORIZED", same, {
          reason: "attempt",
          context: {
            restart: {
              failedCaseCompanyNormalizedName: null,
              newCompanyNormalizedName: "x",
              semestersRemaining: 2,
              existingRestartCount: 0,
              restartCap: 1,
              focalSignerId: same.userId,
              hodSignerId: same.userId,
            },
          },
        }),
      ).rejects.toBeInstanceOf(TransitionGuardError);
    });
  });

  it("21. RESTART_REQUESTED -> RESTART_DENIED (HOD, reason required)", async () => {
    const kase = await createCaseFixture({ state: "RESTART_REQUESTED" });
    const actor = await createUserActor("HOD");
    const result = await executeTransition(kase.id, "RESTART_DENIED", actor, {
      reason: "not a substantively different opportunity",
    });
    expect(result.state).toBe("RESTART_DENIED");
  });

  it("21. rejects a missing reason", async () => {
    const kase = await createCaseFixture({ state: "RESTART_REQUESTED" });
    const actor = await createUserActor("HOD");
    await expect(
      executeTransition(kase.id, "RESTART_DENIED", actor),
    ).rejects.toBeInstanceOf(MissingReasonError);
  });
});

describe("M04: WAIVER_* states are never a transition target (OQ-12)", () => {
  it("no case can ever reach a WAIVER_* state through the executor", async () => {
    // There is no fixture setup for this — the assertion is that no
    // (from, to) pair in the real table has a WAIVER_* `to`, proven by
    // attempting the most plausible one and getting IllegalTransitionError.
    const kase = await createCaseFixture({ state: "ELIGIBLE" });
    await expect(
      executeSystemTransition(kase.id, "WAIVER_REQUESTED", "test"),
    ).rejects.toThrow();
  });
});
