import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Pure, no-I/O token construction — MASTER_PROMPT.md §9: "Supervisor
 * tokens are HMAC-signed, single-use, expiring, and stored hashed."
 * Taken as two separate properties, not one restated: the raw token
 * itself is an HMAC digest (not bare random bytes), and only a hash of
 * *that* is ever persisted. See docs/modules/M08.md "Scope decisions."
 *
 * `issuePasswordResetToken()` (M02) already established "hash what's
 * stored, keep the raw value out of the database" for a similar
 * one-time link — this adds the HMAC layer specifically because the
 * master prompt asks for it here and not there.
 */

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is not set — cannot sign supervisor tokens.");
  }
  return value;
}

/** A fresh, unguessable raw token — HMAC-SHA256 over 32 random bytes,
 * keyed by the server secret. Each call is independently random (the
 * nonce), so the same secret never produces the same token twice. */
export function generateRawSupervisorToken(): string {
  const nonce = randomBytes(32);
  return createHmac("sha256", secret()).update(nonce).digest("hex");
}

/** What actually gets persisted — never the raw token itself. */
export function hashSupervisorToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
