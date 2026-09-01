import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import {
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";
import { computeEligibility } from "@/server/roster/eligibility";
import { isGraduationEligible } from "@/server/roster/graduation";

/**
 * BR-01/BR-04: read-only, computed fresh on every call — see
 * docs/modules/M03.md. Same student.view_own / student.view_any pattern
 * as M02's GET /api/students/:id, including the "404, not 403" ownership
 * rule for a Student requesting someone else's id.
 *
 * BR-03 (M14): `isGraduationEligible` rides along on this same route
 * rather than a new endpoint — both are read-only, computed, per-student
 * facts about the same underlying question ("where does this student
 * stand"), and the ownership/capability gating below already applies to
 * both identically.
 */
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
      identity = requireCapability(rawIdentity, "student.view_any");
      ownershipRequired = false;
    } catch (err) {
      if (err instanceof UnauthenticatedError) throw err;
      identity = requireCapability(rawIdentity, "student.view_own");
      ownershipRequired = true;
    }

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, userId: true, admissionSemesterId: true },
    });

    if (!student) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (ownershipRequired && student.userId !== identity.userId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!ownershipRequired) {
      await requireDepartmentAccess(identity, student.id);
    }

    const semesters = await prisma.semester.findMany({
      select: { id: true, sequenceNumber: true, status: true },
    });

    const result = computeEligibility(student.admissionSemesterId, semesters);
    const graduationEligible = await isGraduationEligible(student.id);
    return NextResponse.json({ ...result, isGraduationEligible: graduationEligible });
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
