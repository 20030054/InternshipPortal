import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { updateSemesterDeadlineSchema } from "@/schemas/roster";
import { setSemesterDeadline } from "@/server/roster/semesters";
import { Prisma } from "@prisma/client";

/** OQ-01, answered: the document submission deadline set when a
 * semester is created is deliberately editable afterward — see
 * `setSemesterDeadline()`'s own doc comment. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const body = await request.json().catch(() => null);
    const parsed = updateSemesterDeadlineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const semester = await setSemesterDeadline(
      id,
      parsed.data.documentDeadline ? new Date(parsed.data.documentDeadline) : null,
    );
    return NextResponse.json(semester);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
