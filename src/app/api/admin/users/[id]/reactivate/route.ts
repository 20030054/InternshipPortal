import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { reactivateUser } from "@/server/users/service";

/** The companion `deactivate` never had — see
 * `src/server/users/service.ts`'s `reactivateUser()` doc comment. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const { id } = await params;
    await reactivateUser(id);

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
