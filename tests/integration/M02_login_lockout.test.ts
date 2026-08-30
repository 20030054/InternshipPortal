import { describe, expect, it } from "vitest";
import {
  AccountLockedError,
  authorizeCredentials,
  RateLimitedError,
} from "@/server/auth/authorize-credentials";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/client";
import { MAX_FAILED_LOGIN_ATTEMPTS } from "@/server/auth/login-attempts";
import { createUserFixture } from "./support/prisma-fixtures";

const PASSWORD = "correct horse battery staple";

async function createUserWithPassword() {
  const user = await createUserFixture();
  const passwordHash = await hashPassword(PASSWORD);
  return prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}

/** Each test gets its own fake source IP so the IP-based rate limiter
 * (also exercised here, deliberately, in its own test) never interferes
 * with a different test's attempt count within the same Redis window. */
function requestFromIp(ip: string): Request {
  return new Request("http://test/login", {
    headers: { "x-forwarded-for": ip },
  });
}

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.99.0.${ipCounter}`;
}

describe("M02: brute-force lockout", () => {
  it(`locks the account after ${MAX_FAILED_LOGIN_ATTEMPTS} failed attempts`, async () => {
    const user = await createUserWithPassword();
    const ip = freshIp();

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      const result = await authorizeCredentials(
        { email: user.email, password: "definitely wrong" },
        requestFromIp(ip),
      );
      expect(result).toBeNull();
    }

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(refreshed.lockedUntil).not.toBeNull();
  });

  it("rejects the correct password while the account is locked", async () => {
    const user = await createUserWithPassword();
    const ip = freshIp();

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      await authorizeCredentials(
        { email: user.email, password: "definitely wrong" },
        requestFromIp(ip),
      );
    }

    await expect(
      authorizeCredentials({ email: user.email, password: PASSWORD }, requestFromIp(ip)),
    ).rejects.toBeInstanceOf(AccountLockedError);
  });

  it("succeeds again once the lockout window has passed", async () => {
    const user = await createUserWithPassword();
    const ip = freshIp();

    for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      await authorizeCredentials(
        { email: user.email, password: "definitely wrong" },
        requestFromIp(ip),
      );
    }

    // Simulate the lockout window having elapsed by moving lockedUntil
    // into the past directly, rather than waiting 15 real minutes or
    // reaching for fake timers around a real database round-trip.
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    const result = await authorizeCredentials(
      { email: user.email, password: PASSWORD },
      requestFromIp(ip),
    );
    expect(result).toEqual({ id: user.id, email: user.email });
  });

  it("a successful login resets the failed-attempt counter and any lock", async () => {
    const user = await createUserWithPassword();
    const ip = freshIp();

    await authorizeCredentials(
      { email: user.email, password: "wrong" },
      requestFromIp(ip),
    );
    await authorizeCredentials(
      { email: user.email, password: "wrong" },
      requestFromIp(ip),
    );

    const result = await authorizeCredentials(
      { email: user.email, password: PASSWORD },
      requestFromIp(ip),
    );
    expect(result).toEqual({ id: user.id, email: user.email });

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(refreshed.failedLoginAttempts).toBe(0);
    expect(refreshed.lockedUntil).toBeNull();
  });

  it("a disabled account never authenticates, correct password or not", async () => {
    const user = await createUserWithPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    });

    const result = await authorizeCredentials(
      { email: user.email, password: PASSWORD },
      requestFromIp(freshIp()),
    );
    expect(result).toBeNull();
  });
});

describe("M02: login rate limiting", () => {
  it("rate-limits login attempts by IP regardless of which email is targeted", async () => {
    const ip = freshIp();
    const user = await createUserWithPassword();

    // The configured limit in authorize-credentials.ts is 10 per 15
    // minutes per IP.
    for (let i = 0; i < 10; i++) {
      await authorizeCredentials(
        { email: `nonexistent-${i}@example.test`, password: "x" },
        requestFromIp(ip),
      );
    }

    await expect(
      authorizeCredentials(
        { email: user.email, password: PASSWORD },
        requestFromIp(ip),
      ),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("a different source IP is not affected by another IP's rate limit", async () => {
    const busyIp = freshIp();
    for (let i = 0; i < 10; i++) {
      await authorizeCredentials(
        { email: `nonexistent-${i}@example.test`, password: "x" },
        requestFromIp(busyIp),
      );
    }

    const user = await createUserWithPassword();
    const cleanIp = freshIp();
    const result = await authorizeCredentials(
      { email: user.email, password: PASSWORD },
      requestFromIp(cleanIp),
    );
    expect(result).toEqual({ id: user.id, email: user.email });
  });
});
