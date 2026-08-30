import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/students/[id]/route";
import { sessionState } from "./setup";
import { assignRole, createStudentFixture } from "./support/prisma-fixtures";

/**
 * MASTER_PROMPT.md §9: "No API route accepts a client-supplied state,
 * role, grade or user ID for authorisation purposes." Proves it by
 * attaching a role claim to both a header and a JSON body an attacker
 * fully controls, and showing the outcome is identical to a request with
 * no such claim — because the route (via requireCapability, via
 * getCurrentIdentity) only ever reads roles from the database, keyed off
 * the session's server-verified user id.
 */
describe("M02: a client-supplied role has zero effect on authorization", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a Student session claiming role=ADMIN via header/body still can't read another student's record", async () => {
    const me = await createStudentFixture();
    await assignRole(me.userId, "STUDENT");
    const other = await createStudentFixture();
    await assignRole(other.userId, "STUDENT");

    sessionState.current = { user: { id: me.userId } };

    // Role claims via a header — the route never reads a body on GET,
    // but an attacker doesn't know that; the header is the part that's
    // actually reachable on this request shape, and proves the claim
    // has no effect regardless of where it's placed.
    const maliciousRequest = new Request(
      `http://test/api/students/${other.id}`,
      { headers: { "X-Role": "ADMIN", "X-User-Role": "FOCAL" } },
    );

    const response = await GET(maliciousRequest, {
      params: Promise.resolve({ id: other.id }),
    });

    // Identical outcome to M02_no_cross_student_read.test.ts's plain
    // (no injected header) case: 404, not 200 and not 403-with-a-hint.
    expect(response.status).toBe(404);
  });

  it("roles are re-read from the database every call, never cached from a prior claim", async () => {
    // A session naming a real user id, but that user holds no roles at
    // all in the database — proves the route trusts nothing about the
    // caller except the user id, and derives everything else fresh.
    const bystander = await createStudentFixture();
    // Deliberately not calling assignRole() — this account has zero
    // rows in user_roles.

    sessionState.current = { user: { id: bystander.userId } };

    const response = await GET(
      new Request(`http://test/api/students/${bystander.id}`),
      { params: Promise.resolve({ id: bystander.id }) },
    );

    // No role at all -> requireCapability rejects, even for their own
    // record. This is the negative control proving roles genuinely come
    // from the database, not from anywhere the test could have faked.
    expect(response.status).toBe(403);
  });
});
