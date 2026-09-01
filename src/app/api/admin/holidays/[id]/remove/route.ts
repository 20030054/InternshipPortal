import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { removeHoliday } from "@/server/roster/holidays";

/** `POST`, not `DELETE` — every mutating route in this codebase is a
 * POST-shaped action (`/open`, `/close`, `/deactivate`, `/withdraw`,
 * ...), matched by `ActionForm`'s own POST-only fetch; a lone REST
 * `DELETE` here would be the one route needing different client-side
 * handling for no real benefit. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const { id } = await params;
    await removeHoliday(id);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
