import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "@/server/mail/transport";
import { POST } from "@/app/api/cases/[id]/supervisor-token/route";
import { sessionState } from "./setup";
import {
  assignRole,
  createCaseFixture,
  createCompanyFixture,
  createUserFixture,
} from "./support/prisma-fixtures";
import { prisma } from "@/server/db/client";

// This route sends the token-issuance email for real (sendMail()) --
// mocked the same way M02_password_reset_flow.test.ts mocks it, since
// no real SMTP server exists in this test loop.
vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

function issueRequest(supervisorEmail: string): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify({ supervisorEmail }),
    headers: { "content-type": "application/json" },
  });
}

/**
 * `supervisor_token.issue` (M02's capability, unused until now).
 * "Focal Person can issue a replacement token, which is audited"
 * (MASTER_PROMPT.md §2.5) — issuing again for the same case is the same
 * code path as the first issuance.
 */
describe("M08: POST /api/cases/:id/supervisor-token", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  async function docsPendingCase() {
    const company = await createCompanyFixture({ name: "Acme Corp" });
    return createCaseFixture({
      state: "DOCS_PENDING",
      companyId: company.id,
      plannedStart: new Date("2026-06-01"),
      plannedEnd: new Date("2026-07-13"),
    });
  }

  it("403s for a non-FOCAL session", async () => {
    const kase = await docsPendingCase();
    const student = await createUserFixture();
    await assignRole(student.id, "STUDENT");
    sessionState.current = { user: { id: student.id } };

    const response = await POST(issueRequest("supervisor@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(403);
  });

  it("401s when unauthenticated", async () => {
    const kase = await docsPendingCase();
    sessionState.current = null;

    const response = await POST(issueRequest("supervisor@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(401);
  });

  it("400s on an invalid email", async () => {
    const kase = await docsPendingCase();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await POST(issueRequest("not-an-email"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(400);
  });

  it("409s outside DOCS_PENDING", async () => {
    const company = await createCompanyFixture({ name: "Acme Corp" });
    const kase = await createCaseFixture({ state: "IN_PROGRESS", companyId: company.id });
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await POST(issueRequest("supervisor@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(409);
  });

  it("succeeds and writes an audit event", async () => {
    const kase = await docsPendingCase();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await POST(issueRequest("supervisor@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.supervisorEmail).toBe("supervisor@acme.test");

    const stored = await prisma.supervisorToken.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(stored.usedAt).toBeNull();
    expect(stored.revokedAt).toBeNull();

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "case", entityId: kase.id, eventType: "SUPERVISOR_TOKEN_ISSUED" },
    });
    expect(audit.actorUserId).toBe(focal.id);
  });

  it("M15: a real SMTP failure returns 503 mail_unavailable, not an unhandled 500 — and the token is still usable to retry", async () => {
    const kase = await docsPendingCase();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    vi.mocked(sendMail).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const response = await POST(issueRequest("supervisor@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("mail_unavailable");

    // A retry (relay reachable this time) succeeds and revokes the
    // token the failed attempt already created — no orphaned/duplicate
    // live tokens left behind by the failure.
    const retry = await POST(issueRequest("supervisor@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(retry.status).toBe(200);

    const liveTokens = await prisma.supervisorToken.findMany({
      where: { caseId: kase.id, usedAt: null, revokedAt: null },
    });
    expect(liveTokens).toHaveLength(1);
  });

  it("a second issuance revokes the first live token", async () => {
    const kase = await docsPendingCase();
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const first = await POST(issueRequest("supervisor-1@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    const firstBody = await first.json();

    const second = await POST(issueRequest("supervisor-2@acme.test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.id).not.toBe(firstBody.id);

    const refreshedFirst = await prisma.supervisorToken.findUniqueOrThrow({
      where: { id: firstBody.id },
    });
    expect(refreshedFirst.revokedAt).not.toBeNull();

    const liveTokens = await prisma.supervisorToken.findMany({
      where: { caseId: kase.id, usedAt: null, revokedAt: null },
    });
    expect(liveTokens).toHaveLength(1);
    expect(liveTokens[0]?.id).toBe(secondBody.id);
  });
});
