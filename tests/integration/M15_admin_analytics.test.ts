import { afterEach, describe, expect, it } from "vitest";
import { getAdminAnalytics } from "@/server/admin/analytics";
import { GET as exportRoute } from "@/app/api/admin/analytics/export/route";
import { sessionState } from "./setup";
import { assignRole, createCaseFixture, createStudentFixture, createUserFixture } from "./support/prisma-fixtures";

/**
 * "Complete reporting and analytics... view live current progress
 * through visuals" — same delta-not-exact-count convention
 * `M13_hod_dashboard.test.ts` already established for this exact
 * reason: `countsByState`/`totalStudents` are shared-database totals,
 * not scoped to this file.
 */
describe("D-126: admin analytics (getAdminAnalytics, export)", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("countsByState reflects a real case that exists right now", async () => {
    await createCaseFixture({ state: "OFFER_UNDER_REVIEW" });

    const analytics = await getAdminAnalytics();
    const row = analytics.countsByState.find((r) => r.state === "OFFER_UNDER_REVIEW");
    expect(row).toBeDefined();
    expect(row!.count).toBeGreaterThanOrEqual(1);
  });

  it("roster.totalStudents increases by exactly one real student created here", async () => {
    const before = await getAdminAnalytics();
    await createStudentFixture();
    const after = await getAdminAnalytics();
    expect(after.roster.totalStudents).toBe(before.roster.totalStudents + 1);
  });

  it("GET /api/admin/analytics/export returns a real xlsx for an Admin", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const response = await exportRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml");
  });

  it("GET /api/admin/analytics/export rejects a non-Admin session", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await exportRoute();
    expect(response.status).toBe(403);
  });
});
