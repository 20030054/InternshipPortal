import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { reverseGradeSchema } from "@/schemas/grading";
import { reverseGrade } from "@/server/grading/service";
import { Prisma } from "@prisma/client";

/** `grade.reverse` (DEAN, new capability — see docs/modules/M09.md
 * "Scope decisions"): BR-14's correction mechanism. Additive only — the
 * `Grade` row itself is never touched, at the database privilege level
 * (M01) and by this route never issuing an update. Doesn't advance
 * `cases.state` (BR-15). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "grade.reverse");

    const body = await request.json().catch(() => null);
    const parsed = reverseGradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const reversal = await reverseGrade({
      gradeId: id,
      deanUserId: identity.userId,
      reason: parsed.data.reason,
    });

    return NextResponse.json(reversal, { status: 201 });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2025" || err.code === "P2003")
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
