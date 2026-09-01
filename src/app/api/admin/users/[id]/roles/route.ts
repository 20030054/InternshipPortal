import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { updateUserRolesSchema } from "@/schemas/users";
import { setUserRoles } from "@/server/users/service";

/** An existing account picking up (or dropping) a role — "this Focal
 * Person is also the HoD," "make this account an Admin too." See
 * `setUserRoles()`'s own doc comment for why this didn't exist
 * before: `POST /api/admin/users` is for genuinely new accounts and
 * correctly refuses a duplicate email. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateUserRolesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    await setUserRoles(id, parsed.data.roles);
    return NextResponse.json({ status: "ok", roles: parsed.data.roles });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
