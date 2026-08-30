import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import {
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";
import { getEvaluationForCase } from "@/server/supervisor/service";

/**
 * MASTER_PROMPT.md §9 "Privacy": "Evaluation comments are visible to
 * Focal Person and HoD only, never to the student, unless the
 * department later decides otherwise (make this a config flag,
 * defaulted to hidden)." `SHOW_EVALUATION_TO_STUDENT` (default false)
 * is that flag.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();

    let identity;
    let ownershipRequired: boolean;
    try {
      identity = requireCapability(rawIdentity, "case.view_any");
      ownershipRequired = false;
    } catch (err) {
      if (err instanceof UnauthenticatedError) throw err;
      identity = requireCapability(rawIdentity, "case.view_own");
      ownershipRequired = true;
    }

    const kase = await prisma.case.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!kase) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (ownershipRequired) {
      const student = await prisma.student.findUnique({
        where: { userId: identity.userId },
        select: { id: true },
      });
      if (student?.id !== kase.studentId) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (process.env.SHOW_EVALUATION_TO_STUDENT !== "true") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    const evaluation = await getEvaluationForCase(id);
    if (!evaluation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(evaluation);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
