import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { allowedDepartmentsFor } from "@/server/authz/department-scope";
import { listWaivers } from "@/server/waivers/service";

/** BR-24: "every waiver is surfaced permanently" — staff-only, reusing
 * `case.view_any` (FOCAL/HOD/DEAN already covers exactly the roles
 * BR-24 names; no new capability needed, see docs/modules/M11.md "Scope
 * decisions"). Full HoD-dashboard aggregation and annual-report export
 * are M13's job — this is the whole of this module's visibility story. */
export async function GET() {
  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.view_any");

    const departments = await allowedDepartmentsFor(identity);
    const waivers = await listWaivers(departments ?? undefined);
    return NextResponse.json(waivers);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
