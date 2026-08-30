import { describe, expect, it } from "vitest";
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
  WeakPasswordError,
} from "@/server/auth/password";

describe("password hashing (argon2id)", () => {
  it("round-trips: a hashed password verifies against the same plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword(hash, "correct horse battery staple"),
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "wrong password entirely")).resolves.toBe(
      false,
    );
  });

  it("never stores the plaintext", async () => {
    const plaintext = "correct horse battery staple";
    const hash = await hashPassword(plaintext);
    expect(hash).not.toContain(plaintext);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("fails closed (returns false, doesn't throw) on a malformed hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything")).resolves.toBe(
      false,
    );
  });

  it(`rejects a password shorter than ${MIN_PASSWORD_LENGTH} characters`, async () => {
    await expect(hashPassword("short1")).rejects.toBeInstanceOf(
      WeakPasswordError,
    );
  });

  it(`accepts a password exactly ${MIN_PASSWORD_LENGTH} characters long`, async () => {
    const exactly = "a".repeat(MIN_PASSWORD_LENGTH);
    await expect(hashPassword(exactly)).resolves.toBeTypeOf("string");
  });
});
