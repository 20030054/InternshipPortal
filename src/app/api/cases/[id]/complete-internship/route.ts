import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";
import { completeInternshipSchema } from "@/schemas/progress";
import { completeInternship } from "@/server/progress/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";

/** `case.progress_log_update` (reused — see docs/modules/M07.md "Scope
 * decisions"): records BR-08's actual dates and fires the real
 * IN_PROGRESS -> DOCS_PENDING transition (row 8), owner only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.progress_log_update");

    const kase = await prisma.case.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!kase) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const student = await prisma.student.findUnique({
      where: { userId: identity.userId },
      select: { id: true },
    });
    if (student?.id !== kase.studentId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = completeInternshipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await completeInternship({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      actualStart: new Date(parsed.data.actualStart),
      actualEnd: new Date(parsed.data.actualEnd),
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
        { error: "completion_rejected", reasons: err.reasons },
        { status: 422 },
      );
    }
    throw err;
  }
}
