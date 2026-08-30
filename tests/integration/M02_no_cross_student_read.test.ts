import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/students/[id]/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";

/**
 * The literal M02 done criterion (docs/modules/M02.md): "an integration
 * test proves a student's session cannot read another student's case
 * through any route" — proven here against Student, the stand-in
 * ownable resource that exists this early (Case doesn't have a route
 * until M04/M05). See that doc's "Scope decisions this module makes".
 */
describe("M02: cross-student read is blocked at the API layer", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a student reading their own record succeeds", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    sessionState.current = { user: { id: student.userId } };

    const response = await GET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(student.id);
  });

  it("a student reading another student's record gets 404, not 403", async () => {
    const me = await createStudentFixture();
    await assignRole(me.userId, "STUDENT");
    const other = await createStudentFixture();
    await assignRole(other.userId, "STUDENT");

    sessionState.current = { user: { id: me.userId } };

    const response = await GET(
      new Request(`http://test/api/students/${other.id}`),
      { params: Promise.resolve({ id: other.id }) },
    );

    // Not 403: the response must never confirm this id exists to a
    // caller who isn't authorized to see it.
    expect(response.status).toBe(404);
  });

  it("a Focal Person can read any student's record", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    const student = await createStudentFixture();

    sessionState.current = { user: { id: focal.id } };

    const response = await GET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(200);
  });

  it("an unauthenticated request gets 401", async () => {
    const student = await createStudentFixture();
    sessionState.current = null;

    const response = await GET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(401);
  });

  it("a non-existent id returns 404 for a Focal Person too", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await GET(
      new Request("http://test/api/students/00000000-0000-7000-8000-000000000000"),
      { params: Promise.resolve({ id: "00000000-0000-7000-8000-000000000000" }) },
    );

    expect(response.status).toBe(404);
  });

  it("a user with no relevant role gets 403 without ever reaching the row check", async () => {
    // A staff account with a role that holds neither student.view_own
    // nor student.view_any (Admin, per the capability matrix).
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    const student = await createStudentFixture();

    sessionState.current = { user: { id: admin.id } };

    const response = await GET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(403);
  });
});
