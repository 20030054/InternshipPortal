import { afterEach, describe, expect, it } from "vitest";
import { POST as setRolesRoute } from "@/app/api/admin/users/[id]/roles/route";
import { prisma } from "@/server/db/client";
import { sessionState } from "./setup";
import { assignRole, createStudentFixture, createUserFixture } from "./support/prisma-fixtures";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function rolesOf(userId: string): Promise<string[]> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { name: true } } },
  });
  return rows.map((r) => r.role.name).sort();
}

/**
 * The real gap the user hit: creating a *new* staff account with a
 * duplicate email correctly 409s (`POST /api/admin/users`, unchanged)
 * — the actual need was giving an *existing* account a second role
 * ("this Focal Person is also the HoD"), which had no route at all
 * until `setUserRoles()`. See its own doc comment.
 */
describe("D-128: an existing staff account can pick up (or drop) a role", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a Focal Person can become a Focal Person + HoD without a new account", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    expect(await rolesOf(focal.id)).toEqual(["FOCAL"]);

    const response = await setRolesRoute(jsonRequest({ roles: ["FOCAL", "HOD"] }), {
      params: Promise.resolve({ id: focal.id }),
    });
    expect(response.status).toBe(200);
    expect(await rolesOf(focal.id)).toEqual(["FOCAL", "HOD"]);
  });

  it("replace-all: submitting fewer roles genuinely removes the dropped one", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const dual = await createUserFixture();
    await assignRole(dual.id, "FOCAL");
    await assignRole(dual.id, "HOD");
    expect(await rolesOf(dual.id)).toEqual(["FOCAL", "HOD"]);

    await setRolesRoute(jsonRequest({ roles: ["HOD"] }), {
      params: Promise.resolve({ id: dual.id }),
    });
    expect(await rolesOf(dual.id)).toEqual(["HOD"]);
  });

  it("a STUDENT role on the same account survives untouched", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    await assignRole(student.userId, "FOCAL");
    expect(await rolesOf(student.userId)).toEqual(["FOCAL", "STUDENT"]);

    await setRolesRoute(jsonRequest({ roles: ["FOCAL", "HOD"] }), {
      params: Promise.resolve({ id: student.userId }),
    });
    expect(await rolesOf(student.userId)).toEqual(["FOCAL", "HOD", "STUDENT"]);
  });

  it("rejects an empty roles array", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");

    const response = await setRolesRoute(jsonRequest({ roles: [] }), {
      params: Promise.resolve({ id: focal.id }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a non-Admin session with 403", async () => {
    const other = await createUserFixture();
    await assignRole(other.id, "FOCAL");
    sessionState.current = { user: { id: other.id } };

    const response = await setRolesRoute(jsonRequest({ roles: ["FOCAL", "HOD"] }), {
      params: Promise.resolve({ id: other.id }),
    });
    expect(response.status).toBe(403);
  });
});
