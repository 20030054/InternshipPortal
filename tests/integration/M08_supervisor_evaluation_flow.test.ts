import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/supervisor/evaluate/[token]/route";
import {
  createCaseFixture,
  createCompanyFixture,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";
import { issueSupervisorToken } from "@/server/supervisor/service";
import { prisma } from "@/server/db/client";

// Each call gets its own source IP: both routes rate-limit by IP
// (checkRateLimit), and this file alone makes more POST calls than the
// 5/hour submit limit allows -- sharing one IP (the "unknown" default
// every Request without an x-forwarded-for header falls back to) would
// make the suite fail on itself, same reasoning as M02_login_lockout.
// test.ts / M02_password_reset_flow.test.ts's identical freshIp().
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.99.0.${ipCounter}`;
}

function getRequest(): Request {
  return new Request("http://test", {
    headers: { "x-forwarded-for": freshIp() },
  });
}

function evalRequest(body?: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
  });
}

const validBody = { performanceRating: 4, comments: "Strong performer, punctual." };

/**
 * MASTER_PROMPT.md §2.5/§9: the public, no-login flow. This module's
 * own stated done criterion: "a used token returns a clean 'already
 * submitted' page and a replayed token is rejected."
 */
describe("M08: public supervisor evaluation flow", () => {
  async function issuedToken(overrides: { fullName?: string } = {}) {
    const user = await createUserFixture(
      overrides.fullName ? { fullName: overrides.fullName } : {},
    );
    const student = await createStudentFixture({ userId: user.id });
    const company = await createCompanyFixture({ name: "Acme Corp" });
    const kase = await createCaseFixture({
      studentId: student.id,
      state: "DOCS_PENDING",
      companyId: company.id,
      plannedStart: new Date("2026-06-01"),
      plannedEnd: new Date("2026-07-13"),
    });
    const focal = await createUserFixture();
    const { rawToken } = await issueSupervisorToken({
      caseId: kase.id,
      supervisorEmail: "supervisor@acme.test",
      issuedBy: focal.id,
    });
    return { rawToken, caseId: kase.id };
  }

  it("GET returns exactly student name, company name and dates for a live token", async () => {
    const { rawToken } = await issuedToken({ fullName: "Alice Example" });

    const response = await GET(getRequest(), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "live",
      studentDisplayName: "Alice Example",
      companyName: "Acme Corp",
      plannedStart: "2026-06-01T00:00:00.000Z",
      plannedEnd: "2026-07-13T00:00:00.000Z",
    });
  });

  it("GET falls back to registrationNumber when the student has no fullName", async () => {
    const { rawToken, caseId } = await issuedToken();
    const kase = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { student: true },
    });

    const response = await GET(getRequest(), {
      params: Promise.resolve({ token: rawToken }),
    });
    const body = await response.json();
    expect(body.studentDisplayName).toBe(kase.student.registrationNumber);
  });

  it("GET 404s for a nonexistent token", async () => {
    const response = await GET(getRequest(), {
      params: Promise.resolve({ token: "not-a-real-token" }),
    });
    expect(response.status).toBe(404);
    expect((await response.json()).status).toBe("invalid");
  });

  it("GET 404s for a revoked token", async () => {
    const { rawToken, caseId } = await issuedToken();
    await prisma.supervisorToken.updateMany({
      where: { caseId },
      data: { revokedAt: new Date() },
    });

    const response = await GET(getRequest(), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(response.status).toBe(404);
  });

  it("GET 404s for an expired token", async () => {
    const { rawToken, caseId } = await issuedToken();
    await prisma.supervisorToken.updateMany({
      where: { caseId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await GET(getRequest(), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(response.status).toBe(404);
  });

  it("POST succeeds once and locks the token", async () => {
    const { rawToken, caseId } = await issuedToken();

    const response = await POST(evalRequest(validBody), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).status).toBe("submitted");

    const token = await prisma.supervisorToken.findFirstOrThrow({ where: { caseId } });
    expect(token.usedAt).not.toBeNull();

    const evaluation = await prisma.evaluation.findUniqueOrThrow({
      where: { supervisorTokenId: token.id },
    });
    expect(evaluation.content).toEqual(validBody);
  });

  it("a replayed POST against the same token gets already_submitted, not an error or a second row", async () => {
    const { rawToken, caseId } = await issuedToken();

    const first = await POST(evalRequest(validBody), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(first.status).toBe(201);

    const second = await POST(
      evalRequest({ performanceRating: 1, comments: "a different, forged replay" }),
      { params: Promise.resolve({ token: rawToken }) },
    );
    expect(second.status).toBe(200);
    expect((await second.json()).status).toBe("already_submitted");

    const evaluations = await prisma.evaluation.findMany({
      where: { supervisorToken: { caseId } },
    });
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]?.content).toEqual(validBody);
  });

  it("a GET against an already-submitted token also reports already_submitted, not live data", async () => {
    const { rawToken } = await issuedToken();
    await POST(evalRequest(validBody), { params: Promise.resolve({ token: rawToken }) });

    const response = await GET(getRequest(), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("already_submitted");
  });

  it("POST 400s on an invalid rating", async () => {
    const { rawToken } = await issuedToken();
    const response = await POST(evalRequest({ performanceRating: 9, comments: "x" }), {
      params: Promise.resolve({ token: rawToken }),
    });
    expect(response.status).toBe(400);
  });

  it("POST 404s for a nonexistent token", async () => {
    const response = await POST(evalRequest(validBody), {
      params: Promise.resolve({ token: "not-a-real-token" }),
    });
    expect(response.status).toBe(404);
  });

  it("rate-limits submission attempts by IP (MASTER_PROMPT.md §9)", async () => {
    const ip = "10.99.99.1"; // one fixed IP for this whole test, deliberately
    const fixedIpRequest = (body: unknown) =>
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
      });

    // The configured limit in the route is 5 per hour per IP. A fresh
    // token per attempt so "already_submitted" never masks the rate
    // limit itself.
    for (let i = 0; i < 5; i++) {
      const { rawToken } = await issuedToken();
      const response = await POST(fixedIpRequest(validBody), {
        params: Promise.resolve({ token: rawToken }),
      });
      expect(response.status).toBe(201);
    }

    const { rawToken: sixthToken } = await issuedToken();
    const sixth = await POST(fixedIpRequest(validBody), {
      params: Promise.resolve({ token: sixthToken }),
    });
    expect(sixth.status).toBe(429);
  });
});
