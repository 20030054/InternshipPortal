import { describe, expect, it } from "vitest";
import { POST as offerRoute } from "@/app/api/cases/[id]/offer/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";

/**
 * §9: "Rate limits on... file upload" — M14's own gap (see
 * docs/DECISIONS.md and src/server/security/rate-limit.ts's
 * `checkUploadRateLimit`, wired into the three upload-accepting routes:
 * offer letter, completion certificate, waiver evidence). All three
 * share one Redis key per user (`upload:<userId>`), so proving it here
 * against the offer route stands in for all three — the limit check
 * itself doesn't know or care which route called it.
 *
 * The check runs immediately after `requireCapability()`, before the
 * case lookup or body parsing, so a request with no real case/body
 * still exercises it — every one of the 11 calls below gets a 404
 * (unknown case id) until the rate limit itself starts returning 429
 * first.
 */
describe("M14: upload rate limiting (checkUploadRateLimit, shared across offer/completion-certificate/waiver routes)", () => {
  it("allows 10 attempts in the window, then rejects the 11th with 429", async () => {
    const student = await createUserFixture();
    await assignRole(student.id, "STUDENT");
    sessionState.current = { user: { id: student.id } };

    const fakeCaseId = crypto.randomUUID();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const response = await offerRoute(
        new Request("http://test", {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id: fakeCaseId }) },
      );
      statuses.push(response.status);
    }

    sessionState.current = null;

    // First 10 all reach past the rate-limit check (none is 429) --
    // they 404 on the nonexistent case, which is fine; only the rate
    // limit's own boundary is under test here.
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });

  it("rate limiting is per-user, not global — a different user is unaffected", async () => {
    const exhausted = await createUserFixture();
    await assignRole(exhausted.id, "STUDENT");
    sessionState.current = { user: { id: exhausted.id } };
    const fakeCaseId = crypto.randomUUID();
    for (let i = 0; i < 11; i++) {
      await offerRoute(
        new Request("http://test", {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id: fakeCaseId }) },
      );
    }

    const fresh = await createUserFixture();
    await assignRole(fresh.id, "STUDENT");
    sessionState.current = { user: { id: fresh.id } };
    const response = await offerRoute(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: crypto.randomUUID() }) },
    );
    sessionState.current = null;

    expect(response.status).not.toBe(429);
  });
});
