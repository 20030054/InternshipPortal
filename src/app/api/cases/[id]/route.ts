import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import {
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";

/** Same case.view_any / case.view_own + "404, not 403" ownership pattern
 * as GET /api/students/:id (M02) and GET /api/students/:id/eligibility
 * (M03). */
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

    const kase = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        state: true,
        previousCaseId: true,
        companyId: true,
        workDescription: true,
        relevanceConfirmed: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
        autoEnrolled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
    }

    return NextResponse.json(kase);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
