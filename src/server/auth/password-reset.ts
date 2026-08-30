import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { hashPassword } from "./password";

/** Not specified by the master prompt; a defensible default for a
 * one-time link, logged in DECISIONS.md. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export class InvalidResetTokenError extends Error {
  constructor() {
    super("This password reset link is invalid or has expired.");
    this.name = "InvalidResetTokenError";
  }
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Issues a fresh reset token for a user, revoking any still-live token
 * first — the partial unique index on password_reset_tokens (WHERE
 * used_at IS NULL AND revoked_at IS NULL, mirroring M01's
 * supervisor_tokens_one_live_per_case) would reject a second live row
 * otherwise. Returns the *raw* token; only its hash is ever persisted.
 */
export async function issuePasswordResetToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return rawToken;
}

/**
 * Redeems a raw token: validates it, sets the new password, and — this
 * is the point of the exercise — bumps tokenVersion so every previously
 * issued session for this account stops working on its very next
 * request (see docs/modules/M02.md "Session and JWT design"). Also
 * clears any brute-force lockout, since a successful reset is a stronger
 * proof of ownership than the lockout was ever protecting against.
 */
export async function redeemPasswordResetToken(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (
    !record ||
    record.usedAt !== null ||
    record.revokedAt !== null ||
    record.expiresAt.getTime() < Date.now()
  ) {
    throw new InvalidResetTokenError();
  }

  // Hash (and validate strength) before the transaction — no reason to
  // hold a DB transaction open across argon2's deliberately-slow work.
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
  ]);
}
