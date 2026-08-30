import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability, UnauthenticatedError } from "@/server/authz/require-capability";

/**
 * Returns the caller's own identity. No ownership check needed beyond
 * "authenticated" — everyone may read who they themselves are — but it
 * still goes through requireCapability with the `self.view` capability
 * (granted to every role) so the pattern stays uniform across every
 * route, not just the ones with something interesting to hide.
 */
export async function GET() {
  try {
    const identity = await getCurrentIdentity();
    const { userId, roles } = requireCapability(identity, "self.view");

    return NextResponse.json({ id: userId, roles });
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    throw err;
  }
}
