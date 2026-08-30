import { afterEach, describe, expect, it } from "vitest";
import { POST as postCases } from "@/app/api/cases/route";
import { POST as postOffer } from "@/app/api/cases/[id]/offer/route";
import { POST as postApprove } from "@/app/api/cases/[id]/approve/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createEligibleStudent } from "./support/offer-fixtures";
import { prisma } from "@/server/db/client";
import { validPdfFile } from "./support/files";

/**
 * The whole normal-path arc M05 owns, through real HTTP-shaped route
 * calls in sequence: open -> submit -> (auto) under review -> approve ->
 * (auto) in progress. Asserts the resulting case_events sequence matches
 * rows 1, 2, 3, 4, 7 of M04's transition table exactly — proof the
 * pieces work *together*, not just each in isolation.
 */
describe("M05: happy path end to end", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("open -> submit -> under review -> approve -> in progress", async () => {
    const student = await createEligibleStudent(4000);
    await assignRole(student.userId, "STUDENT");
    sessionState.current = { user: { id: student.userId } };

    const openResponse = await postCases();
    expect(openResponse.status).toBe(201);
    const opened = await openResponse.json();
    expect(opened.state).toBe("ELIGIBLE");

    const formData = new FormData();
    formData.append("companyName", "Acme Corp");
    formData.append("companyContact", "hr@acme.test");
    formData.append("workDescription", "x".repeat(200));
    formData.append("offerLetter", validPdfFile());

    const submitResponse = await postOffer(
      new Request("http://test", { method: "POST", body: formData }),
      { params: Promise.resolve({ id: opened.id }) },
    );
    expect(submitResponse.status).toBe(200);
    const submitted = await submitResponse.json();
    expect(submitted.state).toBe("OFFER_UNDER_REVIEW");

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const approveResponse = await postApprove(
      new Request("http://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "approved, relevant and within duration bounds",
          plannedStart: "2026-06-01",
          plannedEnd: "2026-07-13",
          relevanceConfirmed: true,
        }),
      }),
      { params: Promise.resolve({ id: opened.id }) },
    );
    expect(approveResponse.status).toBe(200);
    const approved = await approveResponse.json();
    expect(approved.state).toBe("IN_PROGRESS");

    const events = await prisma.caseEvent.findMany({
      where: { caseId: opened.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => [e.fromState, e.toState])).toEqual([
      ["ELIGIBILITY_PENDING", "ELIGIBLE"],
      ["ELIGIBLE", "OFFER_SUBMITTED"],
      ["OFFER_SUBMITTED", "OFFER_UNDER_REVIEW"],
      ["OFFER_UNDER_REVIEW", "APPROVED"],
      ["APPROVED", "IN_PROGRESS"],
    ]);
    expect(events[0]?.systemJob).toBe("case-open");
    expect(events[1]?.actorUserId).toBe(student.userId);
    expect(events[3]?.actorUserId).toBe(focal.id);
    expect(events[3]?.reason).toBe("approved, relevant and within duration bounds");
  });
});
