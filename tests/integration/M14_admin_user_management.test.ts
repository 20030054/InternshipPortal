import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "@/server/mail/transport";
import { prisma } from "@/server/db/client";
import { authorizeCredentials } from "@/server/auth/authorize-credentials";
import { POST as createUserRoute } from "@/app/api/admin/users/route";
import { POST as deactivateRoute } from "@/app/api/admin/users/[id]/deactivate/route";
import { POST as reactivateRoute } from "@/app/api/admin/users/[id]/reactivate/route";
import { POST as confirmResetRoute } from "@/app/api/auth/password-reset/confirm/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";

const sentEmails: Array<{ to: string; subject: string; text: string }> = [];

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async (msg: { to: string; subject: string; text: string }) => {
    sentEmails.push(msg);
  }),
}));

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function extractToken(emailText: string): string {
  const url = emailText.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("welcome email had no URL in its body");
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error("welcome email's URL had no token param");
  return token;
}

/**
 * M14: §2.6 ("Registrar/Admin... create and deactivate user accounts")
 * and the `users.manage` capability's own name existed since M02/M03
 * with no route to call either — a real gap found auditing for this
 * module's §8.3 runbook requirement. See src/server/users/service.ts.
 */
describe("M14: admin user management (users.manage)", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  async function adminSession() {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };
    return admin;
  }

  it("an ADMIN creates a FOCAL account: no password yet, one welcome email, correct role", async () => {
    await adminSession();
    const email = `new-focal-${crypto.randomUUID()}@example.scit.test`;
    const before = sentEmails.length;

    const response = await createUserRoute(
      jsonRequest({ email, roles: ["FOCAL"], fullName: "New Focal Person" }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.email).toBe(email);
    expect(body.roles).toEqual(["FOCAL"]);
    expect(body.emailSent).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeNull();
    expect(user.disabledAt).toBeNull();
    expect(user.fullName).toBe("New Focal Person");

    const roles = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { name: true } } },
    });
    expect(roles.map((r) => r.role.name)).toEqual(["FOCAL"]);

    expect(sentEmails.length).toBe(before + 1);
    expect(sentEmails[sentEmails.length - 1]?.to).toBe(email);
  });

  it("a brand-new account cannot log in until the welcome link is redeemed, and can immediately afterward", async () => {
    await adminSession();
    const email = `onboarding-${crypto.randomUUID()}@example.scit.test`;

    await createUserRoute(jsonRequest({ email, roles: ["HOD"] }));
    const welcomeEmail = sentEmails[sentEmails.length - 1]!;
    const token = extractToken(welcomeEmail.text);

    // Before redeeming: passwordHash is still null -- authorizeCredentials
    // treats that exactly like a wrong password (M02), not a crash.
    const beforeResult = await authorizeCredentials({ email, password: "whatever12345" }, undefined);
    expect(beforeResult).toBeNull();

    const confirmResponse = await confirmResetRoute(
      jsonRequest({ token, newPassword: "a-brand-new-password-123" }),
    );
    expect(confirmResponse.status).toBe(200);

    const afterResult = await authorizeCredentials(
      { email, password: "a-brand-new-password-123" },
      undefined,
    );
    expect(afterResult?.email).toBe(email);
  });

  it("M15: a real SMTP failure still creates a fully working account — 201 with emailSent: false, not a 500", async () => {
    await adminSession();
    const email = `mail-fails-${crypto.randomUUID()}@example.scit.test`;

    vi.mocked(sendMail).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const response = await createUserRoute(jsonRequest({ email, roles: ["FOCAL"] }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.emailSent).toBe(false);

    // The account itself is real and fully usable — no half-created
    // state left behind by the mail failure.
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeNull();
    expect(user.disabledAt).toBeNull();
    const roles = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { name: true } } },
    });
    expect(roles.map((r) => r.role.name)).toEqual(["FOCAL"]);
  });

  it("rejects a duplicate email with 409", async () => {
    await adminSession();
    const email = `dup-${crypto.randomUUID()}@example.scit.test`;
    const first = await createUserRoute(jsonRequest({ email, roles: ["FOCAL"] }));
    expect(first.status).toBe(201);

    const second = await createUserRoute(jsonRequest({ email, roles: ["HOD"] }));
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe("email_in_use");
  });

  it("rejects STUDENT in the roles list — roster import (M03) is the dedicated student path", async () => {
    await adminSession();
    const response = await createUserRoute(
      jsonRequest({ email: "someone@example.scit.test", roles: ["STUDENT"] }),
    );
    expect(response.status).toBe(400);
  });

  it("a non-ADMIN caller (e.g. FOCAL) gets 403", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await createUserRoute(
      jsonRequest({ email: "blocked@example.scit.test", roles: ["FOCAL"] }),
    );
    expect(response.status).toBe(403);
  });

  it("an unauthenticated caller gets 401", async () => {
    sessionState.current = null;
    const response = await createUserRoute(
      jsonRequest({ email: "blocked@example.scit.test", roles: ["FOCAL"] }),
    );
    expect(response.status).toBe(401);
  });

  it("deactivating a user blocks login immediately, even with the correct password", async () => {
    await adminSession();
    const email = `deactivate-me-${crypto.randomUUID()}@example.scit.test`;
    await createUserRoute(jsonRequest({ email, roles: ["FOCAL"] }));
    const token = extractToken(sentEmails[sentEmails.length - 1]!.text);
    await confirmResetRoute(jsonRequest({ token, newPassword: "correct-password-123" }));

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    const deactivateResponse = await deactivateRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: user.id }),
    });
    expect(deactivateResponse.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.disabledAt).not.toBeNull();

    const loginAttempt = await authorizeCredentials(
      { email, password: "correct-password-123" },
      undefined,
    );
    expect(loginAttempt).toBeNull();
  });

  it("deactivating a non-existent user id gets 404", async () => {
    await adminSession();
    const response = await deactivateRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: crypto.randomUUID() }),
    });
    expect(response.status).toBe(404);
  });

  it("a non-ADMIN caller cannot deactivate anyone (403)", async () => {
    const target = await createUserFixture();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await deactivateRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(response.status).toBe(403);

    const stillEnabled = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stillEnabled.disabledAt).toBeNull();
  });

  it("reactivating a deactivated user restores login with the same password", async () => {
    await adminSession();
    const email = `reactivate-me-${crypto.randomUUID()}@example.scit.test`;
    await createUserRoute(jsonRequest({ email, roles: ["FOCAL"] }));
    const token = extractToken(sentEmails[sentEmails.length - 1]!.text);
    await confirmResetRoute(jsonRequest({ token, newPassword: "correct-password-123" }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    await deactivateRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: user.id }),
    });
    expect(
      await authorizeCredentials({ email, password: "correct-password-123" }, undefined),
    ).toBeNull();

    const reactivateResponse = await reactivateRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: user.id }),
    });
    expect(reactivateResponse.status).toBe(200);

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.disabledAt).toBeNull();

    const loginAttempt = await authorizeCredentials(
      { email, password: "correct-password-123" },
      undefined,
    );
    expect(loginAttempt).not.toBeNull();
  });

  it("reactivating a non-existent user id gets 404", async () => {
    await adminSession();
    const response = await reactivateRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: crypto.randomUUID() }),
    });
    expect(response.status).toBe(404);
  });

  it("a non-ADMIN caller cannot reactivate anyone (403)", async () => {
    const target = await createUserFixture();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await reactivateRoute(new Request("http://test", { method: "POST" }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(response.status).toBe(403);
  });
});
