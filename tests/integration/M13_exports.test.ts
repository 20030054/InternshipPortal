import { afterEach, describe, expect, it } from "vitest";
import { GET as exportRoute } from "@/app/api/hod/export/route";
import { GET as summaryPdfRoute } from "@/app/api/cases/[id]/summary-pdf/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createOfferUnderReviewCase } from "./support/offer-fixtures";
import ExcelJS from "exceljs";

describe("M13: exports (XLSX/PDF)", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("GET /api/hod/export requires dashboard.view_hod", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await exportRoute();
    expect(response.status).toBe(403);
  });

  it("401s an unauthenticated caller", async () => {
    sessionState.current = null;
    const response = await exportRoute();
    expect(response.status).toBe(401);
  });

  it("GET /api/hod/export returns a real, parseable XLSX workbook with the expected sheets", async () => {
    const hod = await createUserFixture();
    await assignRole(hod.id, "HOD");
    sessionState.current = { user: { id: hod.id } };

    const response = await exportRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheet");

    const arrayBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const sheetNames = workbook.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      "Counts by state",
      "Overdue eligibility",
      "Pending verifications",
      "Waivers",
      "Restarts",
    ]);
  });

  it("GET /api/cases/:id/summary-pdf returns a real PDF for the case's own student", async () => {
    const { caseId, studentUserId } = await createOfferUnderReviewCase(42500);
    sessionState.current = { user: { id: studentUserId } };

    const response = await summaryPdfRoute(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("404s for a student who doesn't own the case (ownership 404, not 403)", async () => {
    const { caseId } = await createOfferUnderReviewCase(42520);
    const otherStudent = await createUserFixture();
    await assignRole(otherStudent.id, "STUDENT");
    sessionState.current = { user: { id: otherStudent.id } };

    const response = await summaryPdfRoute(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(404);
  });

  it("staff (FOCAL) can view any case's summary PDF", async () => {
    const { caseId } = await createOfferUnderReviewCase(42540);
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await summaryPdfRoute(new Request("http://test"), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(200);
  });

  it("404s for a nonexistent case", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await summaryPdfRoute(new Request("http://test"), {
      params: Promise.resolve({ id: "00000000-0000-7000-8000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });
});
