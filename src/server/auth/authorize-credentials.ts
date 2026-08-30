// From @auth/core directly, not "next-auth" -- next-auth's main entry
// point transitively imports "next/server", which fails to resolve
// outside Next.js's own bundler (e.g. under plain Vitest). @auth/core
// is framework-agnostic and is what next-auth itself re-exports this
// class from, so nothing about the error type actually changes.
import { CredentialsSignin } from "@auth/core/errors";
import { prisma } from "@/server/db/client";
import { isLocked, recordFailedLogin, resetFailedLoginState } from "./login-attempts";
import { verifyPassword } from "./password";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * The Credentials provider's core logic, extracted from
 * src/server/auth/config.ts so it's directly unit/integration-testable —
 * Auth.js's `authorize` callback is defined inline inside a `NextAuth({})`
 * call and can't be imported on its own.
 */

/** Thrown for a locked account — distinct code from a plain wrong
 * password, without confirming *why* to an attacker beyond "try again
 * later." */
export class AccountLockedError extends CredentialsSignin {
  override code = "account_locked";
}

export class RateLimitedError extends CredentialsSignin {
  override code = "rate_limited";
}

export function clientIp(request: Request | undefined): string {
  // Caddy (see Caddyfile) forwards the real client address via
  // X-Forwarded-For. Falls back to a fixed key if absent (e.g. in a test
  // harness that doesn't set it) — rate limiting still applies, just
  // shared across all such callers, which is acceptable since that path
  // is never how a real deployment is reached.
  const forwarded = request?.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
  request: Request | undefined,
): Promise<{ id: string; email: string } | null> {
  const email =
    typeof credentials?.email === "string"
      ? credentials.email.trim().toLowerCase()
      : null;
  const password =
    typeof credentials?.password === "string" ? credentials.password : null;
  if (!email || !password) return null;

  const rate = await checkRateLimit(`login:${clientIp(request)}`, 10, 15 * 60);
  if (!rate.allowed) {
    throw new RateLimitedError();
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || user.disabledAt) {
    // Deliberately the same outcome (null -> generic CredentialsSignin)
    // as a wrong password: confirming "no such account" here would let
    // an attacker enumerate valid emails.
    return null;
  }

  if (isLocked(user.lockedUntil)) {
    throw new AccountLockedError();
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    await recordFailedLogin(user.id);
    return null;
  }

  await resetFailedLoginState(user.id);
  return { id: user.id, email: user.email };
}
