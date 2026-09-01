import { describe, expect, it } from "vitest";
import { listActivityLog } from "@/server/admin/activity-log";
import { prisma } from "@/server/db/client";
import { createCaseFixture, createUserFixture } from "./support/prisma-fixtures";

/**
 * "Admin can view each one's activity" — genesis-inserts real rows
 * directly into `audit_events`/`case_events` (both already real,
 * tested, append-only tables since M01/M04) rather than driving a full
 * business-logic scenario, since the only new logic here is the
 * merge/sort in `listActivityLog()` itself. Filtered by a fresh,
 * random actor's email per test, which sidesteps the shared-database
 * pollution this suite's own retention/holiday tests already ran into
 * — a per-actor filter is naturally isolated no matter what any other
 * file inserts.
 */
describe("D-125: admin activity log (audit_events + case_events, merged)", () => {
  it("merges and sorts both tables for one actor, newest first", async () => {
    const actor = await createUserFixture();
    const kase = await createCaseFixture();

    const older = await prisma.auditEvent.create({
      data: {
        actorUserId: actor.id,
        eventType: "DOCUMENT_DOWNLOADED",
        entityType: "document",
        entityId: kase.id, // any real uuid works as entityId here
      },
    });
    // Ensure a real, distinguishable ordering rather than relying on
    // same-millisecond insert order.
    await new Promise((r) => setTimeout(r, 5));
    const newer = await prisma.caseEvent.create({
      data: {
        caseId: kase.id,
        actorUserId: actor.id,
        fromState: "ELIGIBLE",
        toState: "OFFER_SUBMITTED",
        reason: "test transition",
      },
    });

    const entries = await listActivityLog({ actorEmail: actor.email });

    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toBe(newer.id);
    expect(entries[0]!.kind).toBe("transition");
    expect(entries[0]!.description).toContain("ELIGIBLE → OFFER_SUBMITTED");
    expect(entries[1]!.id).toBe(older.id);
    expect(entries[1]!.kind).toBe("audit");
    expect(entries[1]!.actorEmail).toBe(actor.email);
  });

  it("a real email with no activity returns an empty list, not an error", async () => {
    const actor = await createUserFixture();
    expect(await listActivityLog({ actorEmail: actor.email })).toEqual([]);
  });

  it("an email that doesn't exist at all returns an empty list, not an error", async () => {
    expect(await listActivityLog({ actorEmail: "nobody-real@example.test" })).toEqual([]);
  });
});
