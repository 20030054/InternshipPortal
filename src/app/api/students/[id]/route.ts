import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import {
  ForbiddenError,
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";

/**
 * The M02 demonstration route: `student.view_any` (Focal/HoD/Dean) can
 * read any student; `student.view_own` (Student) can only read the row
 * matching their own account. `Case` doesn't exist as a route yet (M04/
 * M05), so this is what docs/modules/M02.md's done criterion — "a
 * student's session cannot read another student's case through any
 * route" — is proven against for now, using Student as the stand-in
 * ownable resource. See that doc's "Scope decisions" section.
 *
 * A Student requesting someone else's id gets 404, not 403: the response
 * must never confirm *which* ids exist to a caller who isn't authorized
 * to see them (MASTER_PROMPT.md §9 "Ownership is checked on the row, not
 * inferred from the role").
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();

    // Capability check first (requireCapability), row-ownership check
    // second — never the other way around, per §9.
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
      select: {
        id: true,
        userId: true,
        registrationNumber: true,
        programme: true,
        admissionSemesterId: true,
      },
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

    // userId is deliberately not in the response — it's an internal
    // linkage column, not something a caller needs back.
    return NextResponse.json({
      id: student.id,
      registrationNumber: student.registrationNumber,
      programme: student.programme,
      admissionSemesterId: student.admissionSemesterId,
    });
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
