import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";
import { markVerified } from "@/server/grading/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";

/** `deliverable.verify` (FOCAL, reused — see docs/modules/M09.md "Scope
 * decisions"): fires row 10, PENDING_VERIFICATION -> VERIFIED. A
 * distinct, explicit action — not auto-chained the way row 9 is. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "deliverable.verify");

    const kase = await prisma.case.findUnique({ where: { id }, select: { studentId: true } });
    if (kase) {
      await requireDepartmentAccess(identity, kase.studentId);
    }

    const updated = await markVerified({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    if (
      err instanceof CaseNotFoundError ||
      err instanceof IllegalTransitionError ||
      err instanceof WrongActorRoleError ||
      err instanceof MissingReasonError
    ) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
    }
    if (err instanceof TransitionGuardError) {
      return NextResponse.json(
        { error: "not_fully_verified", reasons: err.reasons },
        { status: 422 },
      );
    }
    throw err;
  }
}
