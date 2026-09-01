import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { allowedDepartmentsFor } from "@/server/authz/department-scope";
import { listInProgressOverview } from "@/server/progress/service";

/** MASTER_PROMPT.md's "Focal Person overview of all in-progress
 * internships" — see docs/modules/M07.md "Scope decisions" for why this
 * is a dedicated endpoint rather than a re-listing of M05's
 * GET /api/cases?state=IN_PROGRESS. */
export async function GET() {
  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.view_any");

    const departments = await allowedDepartmentsFor(identity);
    const overview = await listInProgressOverview(departments ?? undefined);
    return NextResponse.json(overview);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
