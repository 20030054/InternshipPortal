import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";
import { restartDenySchema } from "@/schemas/restart";
import { denyRestart, RestartRequestNotPendingError } from "@/server/restart/service";
import {
  IllegalTransitionError,
  MissingReasonError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import { Prisma } from "@prisma/client";

/** `restart.countersign` (HOD — denial is the same review action as
 * countersigning, not a separate capability): fires
 * `RESTART_REQUESTED -> RESTART_DENIED` (BR-18), no guards. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "restart.countersign");

    const body = await request.json().catch(() => null);
    const parsed = restartDenySchema.safeParse(body);
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

    const updated = await denyRestart({
      requestId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      reason: parsed.data.reason,
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    if (
      err instanceof RestartRequestNotPendingError ||
      err instanceof IllegalTransitionError ||
      err instanceof WrongActorRoleError ||
      err instanceof MissingReasonError
    ) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
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
