import type { RoleName } from "@prisma/client";
import { createUserFixture } from "./prisma-fixtures";

/**
 * `case_events.actor_user_id` and `audit_events.actor_user_id` both carry
 * a real foreign key to `users.id` (M01) — an arbitrary label string like
 * `"u1"` fails at the database, not just semantically. This creates a
 * real user row and returns a ready-to-use `TransitionActor`, so M04's
 * tests get a valid UUID without every test needing its own
 * `createUserFixture()` boilerplate.
 *
 * The executor never independently verifies `roles` against the
 * database — it trusts whatever the caller (in production,
 * `getCurrentIdentity()`) asserts — so the roles here don't need
 * matching `user_roles` rows, only the user row itself needs to exist.
 */
export async function createUserActor(
  ...roles: RoleName[]
): Promise<{ type: "user"; userId: string; roles: RoleName[] }> {
  const user = await createUserFixture();
  return { type: "user", userId: user.id, roles };
}
