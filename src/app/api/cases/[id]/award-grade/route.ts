import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { awardGradeSchema } from "@/schemas/grading";
import { awardGrade, NoLiveRecommendationError } from "@/server/grading/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";

/**
 * `grade.award` (HOD): BR-12's award half, BR-13, BR-14. Creates the
 * immutable `Grade` row and fires row 12 (`CLOSED_PASS`) or row 13
 * (`CLOSED_INCOMPLETE`) depending on the HoD's own chosen `value` — not
 * necessarily what the Focal Person recommended, see
 * docs/modules/M09.md "Scope decisions".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "grade.award");

    const body = await request.json().catch(() => null);
    const parsed = awardGradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await awardGrade({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      value: parsed.data.value,
      reason: parsed.data.reason,
    });

    return NextResponse.json(result);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (err instanceof NoLiveRecommendationError) {
      return NextResponse.json({ error: "no_recommendation" }, { status: 409 });
    }
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
        { error: "award_rejected", reasons: err.reasons },
        { status: 422 },
      );
    }
    throw err;
  }
}
