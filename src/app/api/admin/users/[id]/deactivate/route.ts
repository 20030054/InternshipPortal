import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { deactivateUser } from "@/server/users/service";

/** M14: see src/server/users/service.ts's deactivateUser() doc comment
 * — setting `disabledAt` is the entire mechanism; no other state to
 * touch. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const { id } = await params;
    await deactivateUser(id);

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
