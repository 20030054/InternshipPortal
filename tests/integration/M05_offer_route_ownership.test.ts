import { afterEach, describe, expect, it } from "vitest";
import { GET as getCase } from "@/app/api/cases/[id]/route";
import { POST as postCases } from "@/app/api/cases/route";
import { POST as postOffer } from "@/app/api/cases/[id]/offer/route";
import { POST as postApprove } from "@/app/api/cases/[id]/approve/route";
import { POST as postReject } from "@/app/api/cases/[id]/reject/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createOfferUnderReviewCase } from "./support/offer-fixtures";

function jsonRequest(body: unknown): Request {
  return new Request("http://test/api/cases/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/**
 * Same "sees only their own case" / "sees all SCIT cases" split as
 * MASTER_PROMPT.md §2.1/§2.2, exercised the same way M02/M03 already
 * proved it for /api/students/:id and the eligibility route.
 */
describe("M05: case route ownership and capability wiring", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  // File-local sequenceNumber counter — see
  // support/offer-fixtures.ts's doc comment.
  let nextSeq = 3500;

  it("a Student can't view another student's case (404, not 403)", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));

    const other = await createUserFixture();
    await assignRole(other.id, "STUDENT");
    sessionState.current = { user: { id: other.id } };

    const response = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(404);
  });

  it("a Student can't submit an offer against another student's case (404)", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));

    const other = await createUserFixture();
    await assignRole(other.id, "STUDENT");
    sessionState.current = { user: { id: other.id } };

    const formData = new FormData();
    formData.append("companyName", "Acme");
    formData.append("companyContact", "hr@acme.test");
    formData.append("workDescription", "x".repeat(200));
    formData.append(
      "offerLetter",
      new File([new Uint8Array([1])], "offer.pdf", { type: "application/pdf" }),
    );

    const response = await postOffer(
      new Request("http://test", { method: "POST", body: formData }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(404);
  });

  it("a Focal Person can view and act on any case, no ownership restriction", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const viewResponse = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(viewResponse.status).toBe(200);

    const rejectResponse = await postReject(
      jsonRequest({ reason: "duration too short for the programme" }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(rejectResponse.status).toBe(200);
    const body = await rejectResponse.json();
    expect(body.state).toBe("OFFER_REJECTED");
  });

  it("a Student cannot approve or reject an offer (403, wrong capability)", async () => {
    const { caseId, studentUserId } = await createOfferUnderReviewCase((nextSeq += 10));
    sessionState.current = { user: { id: studentUserId } };

    const response = await postApprove(
      jsonRequest({
        reason: "x",
        plannedStart: "2026-06-01",
        plannedEnd: "2026-07-13",
        relevanceConfirmed: true,
      }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(403);
  });

  it("an unauthenticated request to open a case gets 401", async () => {
    sessionState.current = null;
    const response = await postCases();
    expect(response.status).toBe(401);
  });

  it("an unauthenticated request to view a case gets 401", async () => {
    const { caseId } = await createOfferUnderReviewCase((nextSeq += 10));
    sessionState.current = null;

    const response = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(401);
  });
});
