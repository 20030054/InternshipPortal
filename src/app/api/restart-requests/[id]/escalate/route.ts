import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { restartEscalateSchema } from "@/schemas/restart";
import {
  AlreadyEscalatedError,
  escalateRestart,
  RestartRequestNotDeniedError,
} from "@/server/restart/service";
import { Prisma } from "@prisma/client";

/** `escalation.rule_restart` (DEAN): BR-18's final ruling on a denied
 * restart request. Never touches `cases.state` — see `Escalation`'s own
 * doc comment (M01) and docs/modules/M10.md "Scope decisions." */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "escalation.rule_restart");

    const body = await request.json().catch(() => null);
    const parsed = restartEscalateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const escalation = await escalateRestart({
      requestId: id,
      deanUserId: identity.userId,
      reason: parsed.data.reason,
      ruling: parsed.data.ruling,
    });

    return NextResponse.json(escalation, { status: 201 });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (err instanceof RestartRequestNotDeniedError) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
    }
    if (err instanceof AlreadyEscalatedError) {
      return NextResponse.json({ error: "already_escalated" }, { status: 409 });
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
