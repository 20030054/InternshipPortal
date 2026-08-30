import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cases/[id]/approve/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createOfferUnderReviewCase } from "./support/offer-fixtures";
import { approveOffer } from "@/server/offers/service";
import { TransitionGuardError } from "@/server/state-machine/executor";

function approveRequest(body: unknown): Request {
  return new Request("http://test/api/cases/x/approve", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const withinBoundsDates = { plannedStart: "2026-06-01", plannedEnd: "2026-07-13" };

async function asFocal(): Promise<{ userId: string }> {
  const focal = await createUserFixture();
  await assignRole(focal.id, "FOCAL");
  sessionState.current = { user: { id: focal.id } };
  return { userId: focal.id };
}

/**
 * BR-09 (real as of M05, replacing M04's stub) — MASTER_PROMPT.md's own
 * stated done criterion for this module: "an approval cannot be recorded
 * without a reason and a relevance judgement."
 */
describe("BR-09: approval requires relevance confirmation", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  // File-local sequenceNumber counter — see
  // support/offer-fixtures.ts's doc comment.
  let nextSeq = 3000;

  it("400s at the API boundary when relevanceConfirmed is omitted", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    await asFocal();

    const response = await POST(
      approveRequest({ reason: "approved", ...withinBoundsDates }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(400);
  });

  it("400s at the API boundary when relevanceConfirmed is explicitly false", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    await asFocal();

    const response = await POST(
      approveRequest({ reason: "approved", ...withinBoundsDates, relevanceConfirmed: false }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(400);
  });

  it("the guard itself rejects relevanceConfirmed: false, not just the API's zod schema", async () => {
    // Bypasses the route's zod (which only accepts literal true) to prove
    // the transition guard is the real authority, defence in depth —
    // same pattern as BR-12's guard sitting alongside a DB CHECK (M04).
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    const focal = await asFocal();

    await expect(
      approveOffer({
        caseId,
        actor: { userId: focal.userId, roles: ["FOCAL"] },
        reason: "approved",
        plannedStart: new Date(withinBoundsDates.plannedStart),
        plannedEnd: new Date(withinBoundsDates.plannedEnd),
        relevanceConfirmed: false,
      }),
    ).rejects.toBeInstanceOf(TransitionGuardError);
  });

  it("succeeds when relevanceConfirmed is true", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    await asFocal();

    const response = await POST(
      approveRequest({ reason: "approved", ...withinBoundsDates, relevanceConfirmed: true }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.relevanceConfirmed).toBe(true);
  });

  it("400s when the mandatory reason is missing entirely", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    await asFocal();

    const response = await POST(
      approveRequest({ ...withinBoundsDates, relevanceConfirmed: true }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(400);
  });
});
