import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { getHodDashboard } from "@/server/dashboards/hod-view";
import { buildHodDepartmentWorkbook } from "@/server/exports/hod-department-xlsx";

/** `dashboard.view_hod` — the same data `/hod` renders, as a
 * spreadsheet. MASTER_PROMPT.md §7: "Exports to XLSX and PDF." */
export async function GET() {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "dashboard.view_hod");

    const dashboard = await getHodDashboard();
    const buffer = await buildHodDepartmentWorkbook(dashboard);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="department-report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
