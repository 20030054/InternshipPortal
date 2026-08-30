import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { restartRequestSchema } from "@/schemas/restart";
import { requestRestart } from "@/server/restart/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import { Prisma } from "@prisma/client";

/** `restart.initiate` (FOCAL): fires `CLOSED_INCOMPLETE -> RESTART_REQUESTED`
 * (BR-16/17). Always 201s with a real `RestartRequest` row — `PENDING`
 * on success, `DENIED` (with the failing guards) if G1/G2/G4 rejects it
 * — see docs/modules/M10.md "Scope decisions." */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "restart.initiate");

    const body = await request.json().catch(() => null);
    const parsed = restartRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await requestRestart({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      newCompanyName: parsed.data.newCompanyName,
      newCompanyContact: parsed.data.newCompanyContact,
      newCompanyRegistrationNumber: parsed.data.newCompanyRegistrationNumber,
      reason: parsed.data.reason,
    });

    return NextResponse.json(
      {
        requestId: result.request.id,
        outcome: result.outcome,
        reasons: result.outcome === "DENIED" ? result.reasons : undefined,
        case: result.case,
      },
      { status: 201 },
    );
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
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
