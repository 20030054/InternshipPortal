import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import {
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";
import { getCaseSummaryData } from "@/server/exports/case-summary";
import { renderCaseSummaryPdf } from "@/server/exports/case-summary-pdf";

/** §10: "Printed artefacts: case summary PDF... generated server-side."
 * Same case.view_own/case.view_any + "404, not 403" ownership pattern
 * as every other per-case GET route since M05. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();

    let identity;
    let ownershipRequired: boolean;
    try {
      identity = requireCapability(rawIdentity, "case.view_any");
      ownershipRequired = false;
    } catch (err) {
      if (err instanceof UnauthenticatedError) throw err;
      identity = requireCapability(rawIdentity, "case.view_own");
      ownershipRequired = true;
    }

    const kase = await prisma.case.findUnique({ where: { id }, select: { studentId: true } });
    if (!kase) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (ownershipRequired) {
      const student = await prisma.student.findUnique({
        where: { userId: identity.userId },
        select: { id: true },
      });
      if (student?.id !== kase.studentId) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
    } else {
      await requireDepartmentAccess(identity, kase.studentId);
    }

    const data = await getCaseSummaryData(id);
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const buffer = await renderCaseSummaryPdf(data);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="case-summary-${id}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
