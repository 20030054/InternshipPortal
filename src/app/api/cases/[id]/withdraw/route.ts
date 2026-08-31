import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";
import { withdrawCase } from "@/server/offers/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";

/** `case.withdraw` (D-118): fires whichever of M04's five `-> WITHDRAWN`
 * rows matches the case's current state — owner only, no body. Same
 * ownership shape as `POST /api/cases/:id/complete-internship`: a
 * genuine 404, not 403, for a case that isn't this student's own. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.withdraw");

    const kase = await prisma.case.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!kase) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const student = await prisma.student.findUnique({
      where: { userId: identity.userId },
      select: { id: true },
    });
    if (student?.id !== kase.studentId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const updated = await withdrawCase({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
    });

    return NextResponse.json(updated);
  } catch (err) {
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
    throw err;
  }
}
