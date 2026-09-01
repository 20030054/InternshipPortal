import { randomBytes } from "node:crypto";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";

// Excludes 0/O/1/l/I — ambiguous when read off a printed sheet or
// typed in by hand, the exact scenario D-121's sibling feature (a
// downloadable credentials sheet) exists for.
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * OQ-05, answered: a real, random password per newly-imported student
 * — `randomBytes` (the same crypto-secure source `password-reset.ts`/
 * `token-protocol.ts` already use for tokens), not `Math.random()`.
 * 16 chars from a 56-character set is ~93 bits of entropy, comfortably
 * past `MIN_PASSWORD_LENGTH` (12) with room to spare.
 */
export function generateStudentPassword(): string {
  const length = Math.max(16, MIN_PASSWORD_LENGTH);
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += CHARSET[bytes[i]! % CHARSET.length];
  }
  return password;
}
