import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cases/[id]/approve/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createOfferUnderReviewCase } from "./support/offer-fixtures";

function approveRequest(body: unknown): Request {
  return new Request("http://test/api/cases/x/approve", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function asFocal(): Promise<void> {
  const focal = await createUserFixture();
  await assignRole(focal.id, "FOCAL");
  sessionState.current = { user: { id: focal.id } };
}

/** BR-08 (real as of M05, replacing M04's stub): planned duration must
 * fall within MIN_INTERNSHIP_WEEKS..MAX_INTERNSHIP_WEEKS (default 4-8,
 * `.env.example`). Exercised through the real approve route. */
describe("BR-08: approval requires duration within bounds", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  // File-local sequenceNumber counter — see
  // support/offer-fixtures.ts's doc comment on why this is per-file, not
  // shared, and docs/DECISIONS.md for the reserved-block convention.
  let nextSeq = 2500;

  it("422s when the planned end is under the 4-week minimum", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    await asFocal();

    const response = await POST(
      approveRequest({
        reason: "approved",
        plannedStart: "2026-06-01",
        plannedEnd: "2026-06-15", // 2 weeks
        relevanceConfirmed: true,
      }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.reasons.join(" ")).toContain("BR-08");
  });

  it("422s when the planned end exceeds the 8-week maximum", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    await asFocal();

    const response = await POST(
      approveRequest({
        reason: "approved",
        plannedStart: "2026-06-01",
        plannedEnd: "2026-09-01", // ~13 weeks
        relevanceConfirmed: true,
      }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(422);
  });

  it("succeeds within bounds and captures the planned dates, chaining to IN_PROGRESS", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    await asFocal();

    const response = await POST(
      approveRequest({
        reason: "approved, 6 weeks planned",
        plannedStart: "2026-06-01",
        plannedEnd: "2026-07-13", // 6 weeks
        relevanceConfirmed: true,
      }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // Row 7 (APPROVED -> IN_PROGRESS, SYSTEM) chains automatically.
    expect(body.state).toBe("IN_PROGRESS");
    expect(body.plannedStart).toContain("2026-06-01");
    expect(body.plannedEnd).toContain("2026-07-13");
  });
});
