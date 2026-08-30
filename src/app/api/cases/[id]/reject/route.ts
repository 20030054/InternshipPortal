import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { rejectOfferSchema } from "@/schemas/offers";
import { rejectOffer } from "@/server/offers/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";

/** `offer.approve`: the reject half of MASTER_PROMPT.md §3's "Approve or
 * reject offer" row — same capability as approve. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "offer.approve");

    const body = await request.json().catch(() => null);
    const parsed = rejectOfferSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await rejectOffer({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      reason: parsed.data.reason,
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
