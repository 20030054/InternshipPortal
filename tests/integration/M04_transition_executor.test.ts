import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import {
  CaseNotFoundError,
  executeSystemTransition,
  executeTransition,
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import type { Transition } from "@/server/state-machine/types";
import { createCaseFixture } from "./support/prisma-fixtures";
import { createUserActor } from "./support/actor";

/**
 * Exercises the executor's own mechanics — actor/role checking, reason
 * enforcement, guard evaluation, the SET LOCAL-gated write, event
 * emission — against a small synthetic table, deliberately not the real
 * 21-row one (that's M04_all_transitions.test.ts). Still needs a real
 * Postgres: the executor's job *is* database I/O (case lookup, the
 * trigger-gated update, case_events/audit_events writes), so this can't
 * be a no-database unit test the way the guards are.
 */
const SYNTHETIC_TABLE: readonly Transition[] = [
  {
    from: "ELIGIBILITY_PENDING",
    to: "ELIGIBLE",
    actorRole: "SYSTEM",
    guards: [],
    requiresReason: false,
    emitsEvent: "TEST_SYSTEM_ADVANCE",
  },
  {
    from: "ELIGIBLE",
    to: "OFFER_SUBMITTED",
    actorRole: "FOCAL",
    guards: [],
    requiresReason: true,
    emitsEvent: "TEST_REASON_REQUIRED",
  },
  {
    from: "OFFER_SUBMITTED",
    to: "OFFER_UNDER_REVIEW",
    actorRole: "FOCAL",
    guards: [() => ({ ok: false, reason: "synthetic guard always denies" })],
    requiresReason: false,
    emitsEvent: "TEST_GUARD_DENIES",
  },
];

describe("M04: transition executor mechanics (synthetic table)", () => {
  it("throws IllegalTransitionError for an undefined (from, to) pair, and leaves state unchanged", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBILITY_PENDING" });

    await expect(
      executeTransition(kase.id, "CLOSED_PASS", { type: "system", job: "test" }, {
        table: SYNTHETIC_TABLE,
      }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);

    const refreshed = await prisma.case.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(refreshed.state).toBe("ELIGIBILITY_PENDING");
  });

  it("throws WrongActorRoleError when the actor doesn't hold the required role", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBILITY_PENDING" });
    const actor = await createUserActor("STUDENT"); // requires SYSTEM

    await expect(
      executeTransition(kase.id, "ELIGIBLE", actor, { table: SYNTHETIC_TABLE }),
    ).rejects.toBeInstanceOf(WrongActorRoleError);
  });

  it("throws MissingReasonError when requiresReason is true and no reason is given", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBLE" });
    const actor = await createUserActor("FOCAL");

    await expect(
      executeTransition(kase.id, "OFFER_SUBMITTED", actor, {
        table: SYNTHETIC_TABLE,
      }),
    ).rejects.toBeInstanceOf(MissingReasonError);
  });

  it("throws TransitionGuardError when a guard denies, and leaves state unchanged", async () => {
    const kase = await createCaseFixture({ state: "OFFER_SUBMITTED" });
    const actor = await createUserActor("FOCAL");

    await expect(
      executeTransition(kase.id, "OFFER_UNDER_REVIEW", actor, {
        table: SYNTHETIC_TABLE,
      }),
    ).rejects.toBeInstanceOf(TransitionGuardError);

    const refreshed = await prisma.case.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(refreshed.state).toBe("OFFER_SUBMITTED");
  });

  it("throws CaseNotFoundError for a non-existent case id", async () => {
    await expect(
      executeTransition(
        "00000000-0000-7000-8000-000000000000",
        "ELIGIBLE",
        { type: "system", job: "test" },
        { table: SYNTHETIC_TABLE },
      ),
    ).rejects.toBeInstanceOf(CaseNotFoundError);
  });

  it("a successful transition updates state and writes matching case_events + audit_events rows", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBILITY_PENDING" });

    const result = await executeSystemTransition(
      kase.id,
      "ELIGIBLE",
      "test-job",
      { table: SYNTHETIC_TABLE },
    );
    expect(result.state).toBe("ELIGIBLE");

    const refreshed = await prisma.case.findUniqueOrThrow({
      where: { id: kase.id },
    });
    expect(refreshed.state).toBe("ELIGIBLE");

    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId: kase.id },
    });
    expect(event.fromState).toBe("ELIGIBILITY_PENDING");
    expect(event.toState).toBe("ELIGIBLE");
    expect(event.actorUserId).toBeNull();
    expect(event.systemJob).toBe("test-job");

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "case", entityId: kase.id, eventType: "TEST_SYSTEM_ADVANCE" },
    });
    expect(audit.systemJob).toBe("test-job");
    expect(audit.actorUserId).toBeNull();
  });

  it("a user-actor transition's case_events row records the reason and actor", async () => {
    const kase = await createCaseFixture({ state: "ELIGIBLE" });
    const actor = await createUserActor("FOCAL");

    await executeTransition(kase.id, "OFFER_SUBMITTED", actor, {
      table: SYNTHETIC_TABLE,
      reason: "test reason for the record",
    });

    const event = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId: kase.id },
    });
    expect(event.actorUserId).toBe(actor.userId);
    expect(event.systemJob).toBeNull();
    expect(event.reason).toBe("test reason for the record");
  });

  it("a denied transition still writes an audit_events row recording the denial reason", async () => {
    const kase = await createCaseFixture({ state: "OFFER_SUBMITTED" });
    const actor = await createUserActor("FOCAL");

    await expect(
      executeTransition(kase.id, "OFFER_UNDER_REVIEW", actor, {
        table: SYNTHETIC_TABLE,
      }),
    ).rejects.toThrow();

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: {
        entityType: "case",
        entityId: kase.id,
        eventType: "TRANSITION_DENIED",
      },
    });
    const metadata = audit.metadata as { reason?: string } | null;
    expect(metadata?.reason).toContain("synthetic guard always denies");
  });
});
