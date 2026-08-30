import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { approveOfferSchema } from "@/schemas/offers";
import { approveOffer } from "@/server/offers/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";

/** `offer.approve`: MASTER_PROMPT.md §3's "Approve or reject offer" row
 * is one capability covering both — this is the approve half. Captures
 * BR-08's planned dates and BR-09's relevance judgement, then chains
 * through to IN_PROGRESS — see docs/modules/M05.md. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "offer.approve");

    const body = await request.json().catch(() => null);
    const parsed = approveOfferSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await approveOffer({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      reason: parsed.data.reason,
      plannedStart: new Date(parsed.data.plannedStart),
      plannedEnd: new Date(parsed.data.plannedEnd),
      relevanceConfirmed: parsed.data.relevanceConfirmed,
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
    if (err instanceof TransitionGuardError) {
      return NextResponse.json(
        { error: "approval_rejected", reasons: err.reasons },
        { status: 422 },
      );
    }
    throw err;
  }
}
