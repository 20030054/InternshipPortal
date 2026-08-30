import { afterEach, describe, expect, it } from "vitest";
import { GET as meGET } from "@/app/api/me/route";
import { GET as studentGET } from "@/app/api/students/[id]/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";
import { prisma } from "@/server/db/client";

/**
 * MASTER_PROMPT.md §9: "Session invalidation on password change and on
 * role change." docs/modules/M02.md "Session and JWT design" explains the
 * mechanism: getCurrentIdentity() re-reads tokenVersion and roles fresh
 * from the database on every call rather than trusting the session's
 * embedded copy — these tests prove that re-check actually rejects a
 * stale token and actually picks up a role change, not just that the
 * code reads that way.
 */
describe("M02: session invalidation on password change / role change", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a session whose embedded tokenVersion no longer matches the database is rejected", async () => {
    const user = await createUserFixture();
    await assignRole(user.id, "ADMIN");

    // A valid session at token_version 0 (the default)...
    sessionState.current = { user: { id: user.id, tokenVersion: 0 } };
    const before = await meGET();
    expect(before.status).toBe(200);

    // ...then the password changes (or any other event that bumps
    // tokenVersion) without the client re-authenticating.
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    // Same session object as before — nothing client-side changed.
    const after = await meGET();
    expect(after.status).toBe(401);
  });

  it("a role added to an account takes effect on the very next request, no re-issue needed", async () => {
    const user = await createUserFixture();
    const student = await createStudentFixture({ userId: user.id });
    sessionState.current = { user: { id: user.id } };

    // No STUDENT role yet -> denied.
    const before = await studentGET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(before.status).toBe(403);

    // Admin assigns the STUDENT role — same session, same request shape.
    await assignRole(user.id, "STUDENT");

    const after = await studentGET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(after.status).toBe(200);
  });

  it("a role removed from an account takes effect on the very next request", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    const student = await createStudentFixture();
    sessionState.current = { user: { id: focal.id } };

    const before = await studentGET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(before.status).toBe(200);

    // Revoke the FOCAL role.
    const focalRole = await prisma.role.findUniqueOrThrow({
      where: { name: "FOCAL" },
    });
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: focal.id, roleId: focalRole.id } },
    });

    const after = await studentGET(
      new Request(`http://test/api/students/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(after.status).toBe(403);
  });

  it("a disabled account is rejected even with an otherwise-valid session", async () => {
    const user = await createUserFixture();
    await assignRole(user.id, "ADMIN");
    sessionState.current = { user: { id: user.id } };

    const before = await meGET();
    expect(before.status).toBe(200);

    await prisma.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    });

    const after = await meGET();
    expect(after.status).toBe(401);
  });
});
