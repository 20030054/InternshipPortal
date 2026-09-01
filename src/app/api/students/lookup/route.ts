import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { findStudentByRegistrationNumber } from "@/server/students/lookup";

/** `waiver.initiate` (FOCAL) — the narrowest capability that
 * legitimately needs this, not `case.view_any`/`student.view_any`. See
 * `src/server/students/lookup.ts`'s own doc comment for why an
 * exact-registration-number lookup isn't the student directory §9
 * says doesn't exist. */
export async function GET(request: Request) {
  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "waiver.initiate");

    const registrationNumber = new URL(request.url).searchParams.get("registrationNumber");
    if (!registrationNumber) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const student = await findStudentByRegistrationNumber(registrationNumber);
    if (!student) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await requireDepartmentAccess(identity, student.id);

    return NextResponse.json(student);
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
