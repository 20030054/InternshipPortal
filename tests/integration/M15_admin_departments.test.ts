import { afterEach, describe, expect, it } from "vitest";
import { POST as setUserDepartmentsRoute } from "@/app/api/admin/users/[id]/departments/route";
import { POST as setStudentDepartmentRoute } from "@/app/api/students/[id]/department/route";
import { getUserDepartments } from "@/server/departments/service";
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

/** D-127: the two Admin-facing correction routes — assigning a Focal/
 * HoD's departments, and fixing a student's department after roster
 * import. */
describe("D-127: admin department-assignment routes", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("Admin can set, then replace, a Focal Person's departments", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL"); // auto-assigned CS by the fixture default

    const response = await setUserDepartmentsRoute(jsonRequest({ departments: ["SE", "AI"] }), {
      params: Promise.resolve({ id: focal.id }),
    });
    expect(response.status).toBe(200);
    expect((await getUserDepartments(focal.id)).sort()).toEqual(["AI", "SE"]);

    // Replace-all: CS from the fixture default is gone, only what was
    // just submitted remains.
    const second = await setUserDepartmentsRoute(jsonRequest({ departments: ["CS"] }), {
      params: Promise.resolve({ id: focal.id }),
    });
    expect(second.status).toBe(200);
    expect(await getUserDepartments(focal.id)).toEqual(["CS"]);
  });

  it("an empty array un-assigns entirely", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");

    await setUserDepartmentsRoute(jsonRequest({ departments: [] }), {
      params: Promise.resolve({ id: focal.id }),
    });
    expect(await getUserDepartments(focal.id)).toEqual([]);
  });

  it("rejects a non-Admin session with 403", async () => {
    const other = await createUserFixture();
    await assignRole(other.id, "FOCAL");
    sessionState.current = { user: { id: other.id } };

    const response = await setUserDepartmentsRoute(jsonRequest({ departments: ["CS"] }), {
      params: Promise.resolve({ id: other.id }),
    });
    expect(response.status).toBe(403);
  });

  it("Admin can correct a student's department", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };
    const student = await createStudentFixture({ department: "CS" });

    const response = await setStudentDepartmentRoute(jsonRequest({ department: "SE" }), {
      params: Promise.resolve({ id: student.id }),
    });
    expect(response.status).toBe(200);

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(updated.department).toBe("SE");
  });

  it("correcting a non-existent student's department returns 404, not a 500", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const response = await setStudentDepartmentRoute(jsonRequest({ department: "SE" }), {
      params: Promise.resolve({ id: "00000000-0000-7000-8000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });
});
