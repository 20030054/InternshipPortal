import { NextResponse } from "next/server";
import { passwordResetRequestSchema } from "@/schemas/auth";
import { prisma } from "@/server/db/client";
import { issuePasswordResetToken } from "@/server/auth/password-reset";
import { passwordResetEmail } from "@/server/mail/password-reset-email";
import { sendMail } from "@/server/mail/transport";
import { checkRateLimit } from "@/server/security/rate-limit";

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

/**
 * Deliberately does not call requireCapability() — see
 * docs/modules/M02.md's routes-table footnote. Excluded from the
 * mutating-route ESLint rule by its `src/app/api/auth/**` path.
 */
export async function POST(request: Request) {
  const rate = await checkRateLimit(`password-reset:${clientIp(request)}`, 5, 60 * 60);
  if (!rate.allowed) {
    // Same 200 either way (see below) — but a distinct status here would
    // itself leak "someone is hammering this endpoint" information that
    // isn't otherwise observable. 429 is standard and not a meaningful
    // leak on its own.
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  // Always 200 regardless of whether the account exists or is disabled —
  // confirming either would let an attacker enumerate valid emails.
  if (user && !user.disabledAt) {
    const rawToken = await issuePasswordResetToken(user.id);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${rawToken}`;
    const { subject, text } = passwordResetEmail(resetUrl);
    await sendMail({ to: user.email, subject, text });
  }

  return NextResponse.json({ status: "ok" });
}
