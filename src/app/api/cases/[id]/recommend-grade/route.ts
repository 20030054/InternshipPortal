import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { recommendGradeSchema } from "@/schemas/grading";
import { recommendGrade } from "@/server/grading/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";

/** `grade.recommend` (FOCAL): fires row 11, VERIFIED -> GRADE_RECOMMENDED. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "grade.recommend");

    const body = await request.json().catch(() => null);
    const parsed = recommendGradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await recommendGrade({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      value: parsed.data.value,
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
    if (err instanceof TransitionGuardError) {
      return NextResponse.json(
        { error: "recommendation_rejected", reasons: err.reasons },
        { status: 422 },
      );
    }
    throw err;
  }
}
