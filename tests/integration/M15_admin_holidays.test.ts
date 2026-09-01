import { afterEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/admin/holidays/route";
import { POST as removeRoute } from "@/app/api/admin/holidays/[id]/remove/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** OQ-14, answered (D-121): the admin routes behind the holiday
 * calendar that feeds BR-27's SLA clock — see
 * BR27_focal_sla_escalation.test.ts for the sweep-level proof that a
 * configured holiday actually changes the real outcome. */
describe("D-121: admin public-holiday routes (OQ-14)", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("Admin can add, list, and remove a holiday", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const createResponse = await POST(jsonRequest({ date: "2030-07-04", name: "Test Holiday" }));
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.name).toBe("Test Holiday");

    const listResponse = await GET();
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.some((h: { id: string }) => h.id === created.id)).toBe(true);

    const removeResponse = await removeRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(removeResponse.status).toBe(200);

    const listAfterRemove = await GET();
    const listAfter = await listAfterRemove.json();
    expect(listAfter.some((h: { id: string }) => h.id === created.id)).toBe(false);
  });

  it("rejects a duplicate date with 409, not a 500", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    await POST(jsonRequest({ date: "2030-08-15", name: "First" }));
    const secondResponse = await POST(jsonRequest({ date: "2030-08-15", name: "Duplicate" }));
    expect(secondResponse.status).toBe(409);
  });

  it("removing a non-existent holiday returns 404, not a 500", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const response = await removeRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: "00000000-0000-7000-8000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a non-Admin session", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    expect((await GET()).status).toBe(403);
    expect((await POST(jsonRequest({ date: "2030-09-01", name: "x" }))).status).toBe(403);
  });
});
