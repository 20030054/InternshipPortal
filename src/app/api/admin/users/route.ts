import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { createUserSchema } from "@/schemas/users";
import { createStaffUser, EmailAlreadyInUseError } from "@/server/users/service";

/**
 * M14: §2.6's "create and deactivate user accounts" — see
 * src/server/users/service.ts's doc comment for why this route didn't
 * exist before this module despite the `users.manage` capability
 * already existing since M02.
 */
export async function POST(request: Request) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const body = await request.json().catch(() => null);
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const user = await createStaffUser(parsed.data);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof EmailAlreadyInUseError) {
      return NextResponse.json({ error: "email_in_use", message: err.message }, { status: 409 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
