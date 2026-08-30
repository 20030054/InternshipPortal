import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/auth/password";
import { createUserFixture } from "./support/prisma-fixtures";

const sentEmails: Array<{ to: string; subject: string; text: string }> = [];

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(
    async (msg: { to: string; subject: string; text: string }) => {
      sentEmails.push(msg);
    },
  ),
}));

const { POST: requestPOST } = await import(
  "@/app/api/auth/password-reset/request/route"
);
const { POST: confirmPOST } = await import(
  "@/app/api/auth/password-reset/confirm/route"
);

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.98.0.${ipCounter}`;
}

// Each call gets its own source IP: the request route rate-limits by
// IP (5/hour), and this file alone makes more than 5 requests across
// its tests -- sharing one IP would make the suite fail on itself.
function requestReset(email: string) {
  return requestPOST(
    new Request("http://test/api/auth/password-reset/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": freshIp(),
      },
      body: JSON.stringify({ email }),
    }),
  );
}

function confirmReset(token: string, newPassword: string) {
  return confirmPOST(
    new Request("http://test/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    }),
  );
}

function extractToken(resetUrl: string): string {
  const token = new URL(resetUrl).searchParams.get("token");
  if (!token) throw new Error("reset URL had no token param");
  return token;
}

describe("M02: password reset flow", () => {
  it("issues a token and emails it when the account exists and is enabled", async () => {
    const user = await createUserFixture();
    const before = sentEmails.length;

    const response = await requestReset(user.email);

    expect(response.status).toBe(200);
    expect(sentEmails.length).toBe(before + 1);
    expect(sentEmails[sentEmails.length - 1]?.to).toBe(user.email);

    const tokenRow = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, revokedAt: null },
    });
    expect(tokenRow).not.toBeNull();
  });

  it("always returns 200 for a non-existent email, and sends no mail", async () => {
    const before = sentEmails.length;

    const response = await requestReset("no-such-account@example.test");

    expect(response.status).toBe(200);
    expect(sentEmails.length).toBe(before);
  });

  it("returns 200 and sends no mail for a disabled account", async () => {
    const user = await createUserFixture();
    await prisma.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    });
    const before = sentEmails.length;

    const response = await requestReset(user.email);

    expect(response.status).toBe(200);
    expect(sentEmails.length).toBe(before);
  });

  it("requesting again while a token is live revokes the first, not both live", async () => {
    const user = await createUserFixture();

    await requestReset(user.email);
    const firstToken = extractToken(
      sentEmails[sentEmails.length - 1]!.text.match(/https?:\/\/\S+/)![0],
    );

    await requestReset(user.email);
    const secondToken = extractToken(
      sentEmails[sentEmails.length - 1]!.text.match(/https?:\/\/\S+/)![0],
    );

    expect(firstToken).not.toBe(secondToken);

    // The first token is now revoked and must not work.
    const firstAttempt = await confirmReset(firstToken, "a-strong-new-password-1");
    expect(firstAttempt.status).toBe(400);

    // The second (live) token works.
    const secondAttempt = await confirmReset(
      secondToken,
      "a-strong-new-password-2",
    );
    expect(secondAttempt.status).toBe(200);
  });

  it("confirm with a valid token changes the password and invalidates prior sessions", async () => {
    const user = await createUserFixture();
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    await requestReset(user.email);
    const token = extractToken(
      sentEmails[sentEmails.length - 1]!.text.match(/https?:\/\/\S+/)![0],
    );

    const response = await confirmReset(token, "a-brand-new-strong-password");
    expect(response.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(after.passwordHash).not.toBeNull();
    await expect(
      verifyPassword(after.passwordHash!, "a-brand-new-strong-password"),
    ).resolves.toBe(true);

    const tokenRow = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(tokenRow.usedAt).not.toBeNull();
  });

  it("rejects a reused (already-redeemed) token", async () => {
    const user = await createUserFixture();
    await requestReset(user.email);
    const token = extractToken(
      sentEmails[sentEmails.length - 1]!.text.match(/https?:\/\/\S+/)![0],
    );

    const first = await confirmReset(token, "first-strong-password-1");
    expect(first.status).toBe(200);

    const second = await confirmReset(token, "second-strong-password-2");
    expect(second.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const user = await createUserFixture();
    await requestReset(user.email);
    const token = extractToken(
      sentEmails[sentEmails.length - 1]!.text.match(/https?:\/\/\S+/)![0],
    );

    const tokenRow = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null },
    });
    await prisma.passwordResetToken.update({
      where: { id: tokenRow.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await confirmReset(token, "a-strong-password-here");
    expect(response.status).toBe(400);
  });

  it("rejects an unknown token outright", async () => {
    const response = await confirmReset(
      "not-a-real-token-at-all",
      "a-strong-password-here",
    );
    expect(response.status).toBe(400);
  });

  it("rejects a too-short new password without consuming the token", async () => {
    const user = await createUserFixture();
    await requestReset(user.email);
    const token = extractToken(
      sentEmails[sentEmails.length - 1]!.text.match(/https?:\/\/\S+/)![0],
    );

    const weakAttempt = await confirmReset(token, "short1");
    expect(weakAttempt.status).toBe(400);

    // Since the weak password never passed validation, the token is
    // still unredeemed and this follow-up with a strong password works.
    const strongAttempt = await confirmReset(token, "a-strong-password-now");
    expect(strongAttempt.status).toBe(200);
  });
});
