import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DepartmentAccessDeniedError, requireDepartmentAccess } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";
import { waiverDecisionSchema } from "@/schemas/waivers";
import { denyWaiverAtHod, WaiverNotInProgressError } from "@/server/waivers/service";
import {
  IllegalTransitionError,
  MissingReasonError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import { Prisma } from "@prisma/client";

/** `waiver.countersign` (HOD — refusal is the other outcome of the same
 * review action, not a separate capability, same pattern M10 used for
 * restart-deny): fires row 23, WAIVER_REQUESTED -> WAIVER_DENIED. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "waiver.countersign");

    const body = await request.json().catch(() => null);
    const parsed = waiverDecisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const waiverRow = await prisma.waiver.findUnique({ where: { id }, select: { studentId: true } });
    if (waiverRow) {
      await requireDepartmentAccess(identity, waiverRow.studentId);
    }

    const waiver = await denyWaiverAtHod({
      waiverId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      reason: parsed.data.reason,
    });

    return NextResponse.json(waiver);
  } catch (err) {
    if (err instanceof DepartmentAccessDeniedError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    if (
      err instanceof WaiverNotInProgressError ||
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
