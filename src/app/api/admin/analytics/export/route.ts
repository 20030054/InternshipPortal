import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { getHodDashboard } from "@/server/dashboards/hod-view";
import { buildHodDepartmentWorkbook } from "@/server/exports/hod-department-xlsx";

/** The same real, tested department report HoD already has
 * (`/api/hod/export`) — reused rather than duplicated, gated here by
 * `users.manage` instead of `dashboard.view_hod` so Admin can pull it
 * too without needing the HOD role. */
export async function GET() {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const dashboard = await getHodDashboard();
    const buffer = await buildHodDepartmentWorkbook(dashboard);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="admin-report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
