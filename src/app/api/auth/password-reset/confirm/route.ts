import { NextResponse } from "next/server";
import { passwordResetConfirmSchema } from "@/schemas/auth";
import {
  InvalidResetTokenError,
  redeemPasswordResetToken,
} from "@/server/auth/password-reset";
import { WeakPasswordError } from "@/server/auth/password";

/**
 * Deliberately does not call requireCapability() — proof of authorization
 * here is possession of the emailed token, not a session/role. See
 * docs/modules/M02.md's routes-table footnote. Excluded from the
 * mutating-route ESLint rule by its `src/app/api/auth/**` path.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await redeemPasswordResetToken(parsed.data.token, parsed.data.newPassword);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    if (err instanceof InvalidResetTokenError) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }
    if (err instanceof WeakPasswordError) {
      return NextResponse.json({ error: "weak_password" }, { status: 400 });
    }
    throw err;
  }
}
