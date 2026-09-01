import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";
import { restartCountersignSchema } from "@/schemas/restart";
import {
  countersignRestart,
  MissingOverrideAcknowledgementError,
  RestartRequestNotPendingError,
} from "@/server/restart/service";
import {
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import { Prisma } from "@prisma/client";

/** `restart.countersign` (HOD): fires `RESTART_REQUESTED -> RESTART_AUTHORIZED`
 * (G5) then creates the new linked case (BR-20). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "restart.countersign");

    const body = await request.json().catch(() => null);
    const parsed = restartCountersignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const request_ = await prisma.restartRequest.findUnique({
      where: { id },
      select: { failedCase: { select: { studentId: true } } },
    });
    if (request_) {
      await requireDepartmentAccess(identity, request_.failedCase.studentId);
    }

    const result = await countersignRestart({
      requestId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      reason: parsed.data.reason,
      acknowledgeFlaggedMatch: parsed.data.acknowledgeFlaggedMatch,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    if (err instanceof MissingOverrideAcknowledgementError) {
      return NextResponse.json({ error: "override_required" }, { status: 400 });
    }
    if (
      err instanceof RestartRequestNotPendingError ||
      err instanceof IllegalTransitionError ||
      err instanceof WrongActorRoleError ||
      err instanceof MissingReasonError
    ) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
    }
    if (err instanceof TransitionGuardError) {
      return NextResponse.json(
        { error: "countersign_rejected", reasons: err.reasons },
        { status: 409 },
      );
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
