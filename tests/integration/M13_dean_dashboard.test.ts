import { describe, expect, it } from "vitest";
import { getDeanDashboard } from "@/server/dashboards/dean-view";
import { createPendingWaiver, createCountersignedWaiver } from "./support/waiver-fixtures";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createClosedIncompleteCase } from "./support/case-lifecycle";
import { requestRestart, denyRestart, escalateRestart } from "@/server/restart/service";

/**
 * G2 (BR-17) needs `createClosedIncompleteCase()`'s student to have
 * *few enough* completed semesters that time still "remains" before the
 * graduation boundary — the same upper-bounded sensitivity D-064/D-077
 * already document for BR17/BR27's own tests. Because this file
 * ("M13_dean_dashboard") sorts *after* "M03_..." alphabetically,
 * M03_eligibility_route_ownership.test.ts's own 50000/60000/70000/80000
 * blocks (and M03_semester_admin_routes.test.ts's `nextSequenceNumber()`
 * — "always above the current global max," observed reaching into the
 * tens of millions in a real run) already exist in the database by the
 * time this file runs, and all of them are >= any block in the 41000-
 * 49999 window D-064 established for files that sort *before* M03. A
 * fixed block far above anything `nextSequenceNumber()` could plausibly
 * reach in one run (comfortably below Postgres INTEGER's own ~2.1
 * billion ceiling) is what actually holds here, not "below 50000."
 */
const G2_SAFE_BLOCK = 500_000_000;

describe("M13: Dean read-only view", () => {
  it("carries the same department data the HoD view has (counts by state)", async () => {
    const dashboard = await getDeanDashboard();
    expect(Array.isArray(dashboard.countsByState)).toBe(true);
    expect(Array.isArray(dashboard.waivers)).toBe(true);
    expect(Array.isArray(dashboard.restarts)).toBe(true);
  });

  it("a waiver at WAIVER_REQUESTED is not yet awaiting the Dean (the HoD hasn't countersigned)", async () => {
    const { waiverId } = await createPendingWaiver();
    const dashboard = await getDeanDashboard();
    expect(dashboard.awaitingDean.map((i) => i.id)).not.toContain(waiverId);
  });

  it("a waiver countersigned by the HoD appears in awaitingDean", async () => {
    await createCountersignedWaiver();
    const dashboard = await getDeanDashboard();
    expect(dashboard.awaitingDean.some((i) => i.kind === "waiver")).toBe(true);
  });

  it("a denied restart request with no ruling yet appears in awaitingDean", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(G2_SAFE_BLOCK);
    await assignRole(focalUserId, "FOCAL");
    const requested = await requestRestart({
      caseId,
      actor: { userId: focalUserId, roles: ["FOCAL"] },
      newCompanyName: "Umbrella Dean Corp",
      newCompanyContact: "hr@umbrelladean.test",
      reason: "genuinely different placement",
    });
    expect(requested.outcome).toBe("PENDING"); // sanity: G1/G2/G4 all pass
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    await denyRestart({
      requestId: requested.request.id,
      actor: { userId: hod.id, roles: ["HOD"] },
      reason: "not convinced",
    });

    const dashboard = await getDeanDashboard();
    expect(
      dashboard.awaitingDean.some((i) => i.kind === "restart_escalation" && i.id === requested.request.id),
    ).toBe(true);
  });

  it("an already-escalated (ruled-on) restart denial does not appear in awaitingDean", async () => {
    const { caseId, focalUserId } = await createClosedIncompleteCase(G2_SAFE_BLOCK + 20);
    await assignRole(focalUserId, "FOCAL");
    const requested = await requestRestart({
      caseId,
      actor: { userId: focalUserId, roles: ["FOCAL"] },
      newCompanyName: "Initech Dean Corp",
      newCompanyContact: "hr@initechdean.test",
      reason: "genuinely different placement",
    });
    expect(requested.outcome).toBe("PENDING");
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    await denyRestart({
      requestId: requested.request.id,
      actor: { userId: hod.id, roles: ["HOD"] },
      reason: "not convinced",
    });

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    await escalateRestart({
      requestId: requested.request.id,
      deanUserId: dean.id,
      reason: "reviewed",
      ruling: "denial upheld",
    });

    const dashboard = await getDeanDashboard();
    expect(
      dashboard.awaitingDean.some((i) => i.kind === "restart_escalation" && i.id === requested.request.id),
    ).toBe(false);
  });
});
