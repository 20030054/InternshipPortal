import { afterEach, describe, expect, it } from "vitest";
import { GET as getCase } from "@/app/api/cases/[id]/route";
import { POST as rejectOffer } from "@/app/api/cases/[id]/reject/route";
import { getFocalWorkQueue } from "@/server/dashboards/focal-queue";
import { getHodDashboard } from "@/server/dashboards/hod-view";
import { sessionState } from "./setup";
import {
  assignDepartments,
  assignRole,
  createCaseFixture,
  createStudentFixture,
  createUserFixture,
} from "./support/prisma-fixtures";

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * D-127: department-scoped access, proven live — a CS-only Focal
 * Person genuinely cannot see or act on an SE student's case (404, not
 * 403 — §9's "an out-of-scope resource doesn't even reveal it
 * exists"), the same Focal Person *can* once explicitly assigned to
 * SE, and DEAN stays unscoped throughout. `createCaseFixture()`
 * (genesis insert, `state` set directly) is used deliberately instead
 * of driving a real offer through `openCase()`/`submitOffer()` — this
 * file only cares whether the department check fires, not how a case
 * normally reaches a given state.
 */
describe("D-127: department-scoped access (Focal/HoD)", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("a CS-only Focal Person gets 404 (not 403) for an SE student's case; a Dean sees it regardless", async () => {
    const seStudent = await createStudentFixture({ department: "SE" });
    const kase = await createCaseFixture({ studentId: seStudent.id, state: "OFFER_UNDER_REVIEW" });

    const csFocal = await createUserFixture();
    await assignRole(csFocal.id, "FOCAL"); // auto-assigned CS by the fixture default
    sessionState.current = { user: { id: csFocal.id } };

    const deniedView = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(deniedView.status).toBe(404);

    const deniedAction = await rejectOffer(jsonRequest({ reason: "x".repeat(20) }), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(deniedAction.status).toBe(404);

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };

    const deanView = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(deanView.status).toBe(200);
  });

  it("assigning the Focal Person to SE grants access to the same case that was 404 before", async () => {
    const seStudent = await createStudentFixture({ department: "SE" });
    const kase = await createCaseFixture({ studentId: seStudent.id, state: "OFFER_UNDER_REVIEW" });

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL"); // auto-assigned CS
    sessionState.current = { user: { id: focal.id } };
    expect(
      (await getCase(new Request("http://test"), { params: Promise.resolve({ id: kase.id }) }))
        .status,
    ).toBe(404);

    await assignDepartments(focal.id, ["SE"]); // replace-all: now SE only, not CS+SE
    const afterAssignment = await getCase(new Request("http://test"), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(afterAssignment.status).toBe(200);
  });

  it("a student with no department assigned is invisible to a Focal Person, visible to a Dean", async () => {
    const unassignedStudent = await createStudentFixture({ department: null });
    const kase = await createCaseFixture({
      studentId: unassignedStudent.id,
      state: "OFFER_UNDER_REVIEW",
    });

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };
    expect(
      (await getCase(new Request("http://test"), { params: Promise.resolve({ id: kase.id }) }))
        .status,
    ).toBe(404);

    const dean = await createUserFixture();
    await assignRole(dean.id, "DEAN");
    sessionState.current = { user: { id: dean.id } };
    expect(
      (await getCase(new Request("http://test"), { params: Promise.resolve({ id: kase.id }) }))
        .status,
    ).toBe(200);
  });

  it("getFocalWorkQueue only returns the caller's own department's cases when filtered", async () => {
    const csStudent = await createStudentFixture({ department: "CS" });
    const seStudent = await createStudentFixture({ department: "SE" });
    const csCase = await createCaseFixture({
      studentId: csStudent.id,
      state: "OFFER_UNDER_REVIEW",
    });
    const seCase = await createCaseFixture({
      studentId: seStudent.id,
      state: "OFFER_UNDER_REVIEW",
    });

    const unfiltered = await getFocalWorkQueue();
    expect(unfiltered.some((r) => r.caseId === csCase.id)).toBe(true);
    expect(unfiltered.some((r) => r.caseId === seCase.id)).toBe(true);

    const csOnly = await getFocalWorkQueue(undefined, ["CS"]);
    expect(csOnly.some((r) => r.caseId === csCase.id)).toBe(true);
    expect(csOnly.some((r) => r.caseId === seCase.id)).toBe(false);
  });

  it("getHodDashboard's pendingVerifications only reflects the caller's own department when filtered", async () => {
    const seStudent = await createStudentFixture({ department: "SE" });
    const seCase = await createCaseFixture({
      studentId: seStudent.id,
      state: "PENDING_VERIFICATION",
    });

    const unfiltered = await getHodDashboard();
    expect(unfiltered.pendingVerifications.some((row) => row.caseId === seCase.id)).toBe(true);

    const csOnly = await getHodDashboard(["CS"]);
    expect(csOnly.pendingVerifications.some((row) => row.caseId === seCase.id)).toBe(false);

    const seOnly = await getHodDashboard(["SE"]);
    expect(seOnly.pendingVerifications.some((row) => row.caseId === seCase.id)).toBe(true);
  });
});
