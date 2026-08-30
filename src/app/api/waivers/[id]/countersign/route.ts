import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { waiverDecisionSchema } from "@/schemas/waivers";
import { countersignWaiver, WaiverNotInProgressError } from "@/server/waivers/service";
import {
  IllegalTransitionError,
  MissingReasonError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import { Prisma } from "@prisma/client";

/** `waiver.countersign` (HOD): fires row 22, WAIVER_REQUESTED ->
 * WAIVER_COUNTERSIGNED. */
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

    const waiver = await countersignWaiver({
      waiverId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      reason: parsed.data.reason,
    });

    return NextResponse.json(waiver);
  } catch (err) {
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
