import * as argon2 from "argon2";

/**
 * argon2id, per MASTER_PROMPT.md §6.1 ("Not bcrypt, not SHA"). Defaults
 * (argon2's own recommended parameters) are used rather than hand-tuned
 * cost factors — argon2's defaults already target ~19 MiB memory / a
 * sensible time cost for a web login path; overriding them without a
 * measured reason on the target hardware would be guessing.
 */

export const MIN_PASSWORD_LENGTH = 12;

export class WeakPasswordError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = "WeakPasswordError";
  }
}

/** Throws WeakPasswordError if the password doesn't meet the minimum. */
export function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError();
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordStrength(password);
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Verifies a plaintext password against a stored hash. Returns false
 * (never throws) on a malformed/foreign hash, so a corrupted or
 * legacy-format value fails closed as "wrong password" rather than
 * crashing the login route.
 */
export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
