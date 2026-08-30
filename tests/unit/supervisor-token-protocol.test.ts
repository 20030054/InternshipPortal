import { beforeAll, describe, expect, it } from "vitest";
import {
  generateRawSupervisorToken,
  hashSupervisorToken,
} from "@/server/supervisor/token-protocol";

describe("supervisor token protocol", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "test-secret-for-unit-tests-only";
  });

  it("generates a fresh, unpredictable token on every call", () => {
    const a = generateRawSupervisorToken();
    const b = generateRawSupervisorToken();
    expect(a).not.toBe(b);
    // 32 random bytes HMAC-SHA256'd -> 64 hex characters.
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes deterministically: the same raw token always hashes the same way", () => {
    const raw = generateRawSupervisorToken();
    expect(hashSupervisorToken(raw)).toBe(hashSupervisorToken(raw));
  });

  it("a single-character change in the raw token changes its hash", () => {
    const raw = generateRawSupervisorToken();
    const tampered = raw.slice(0, -1) + (raw.at(-1) === "0" ? "1" : "0");
    expect(hashSupervisorToken(tampered)).not.toBe(hashSupervisorToken(raw));
  });

  it("the hash never contains the raw token as a substring", () => {
    const raw = generateRawSupervisorToken();
    const hash = hashSupervisorToken(raw);
    expect(hash).not.toContain(raw);
  });
});
