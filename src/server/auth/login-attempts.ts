import { prisma } from "@/server/db/client";

/**
 * Brute-force lockout (MASTER_PROMPT.md §9 "Sessions and secrets").
 * Neither number is specified by the master prompt; both are defensible
 * defaults for a low-traffic departmental system, logged in
 * DECISIONS.md rather than OPEN_QUESTIONS.md — this is an implementation
 * detail, not a policy question for the HoD.
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export function isLocked(lockedUntil: Date | null): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > Date.now();
}

/**
 * Records one failed login attempt and locks the account once the
 * threshold is reached. Called from the Credentials provider's
 * `authorize()` — never from a route a client could hit directly with an
 * arbitrary userId, since that would let one account lock out another.
 */
export async function recordFailedLogin(userId: string): Promise<void> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (updated.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000),
      },
    });
  }
}

/** Called after a successful login — clears the counter and any lock. */
export async function resetFailedLoginState(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}
