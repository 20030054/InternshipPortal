import { auth } from "./config";
import { loadIdentity } from "./identity";
import type { CurrentIdentity } from "@/server/authz/require-capability";

/**
 * The bridge between Auth.js's session and requireCapability's pure
 * decision function. Every route handler that needs to authorize a
 * request calls this once, then passes the result to requireCapability().
 *
 * Deliberately re-checks tokenVersion against a fresh database read
 * rather than trusting the session's embedded copy: the `jwt` callback in
 * config.ts already refreshes it on every request, but this second check
 * makes the security property hold regardless of that callback's exact
 * behavior on invalidation (Auth.js's `null`-return-to-invalidate
 * contract is real, but this route-level check doesn't have to depend on
 * it to be correct — see DECISIONS.md).
 */
export async function getCurrentIdentity(): Promise<CurrentIdentity> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const identity = await loadIdentity(userId);
  if (!identity) return null;

  const sessionTokenVersion = session.user.tokenVersion;
  if (
    typeof sessionTokenVersion === "number" &&
    sessionTokenVersion !== identity.tokenVersion
  ) {
    return null;
  }

  return { userId: identity.userId, roles: identity.roles };
}
