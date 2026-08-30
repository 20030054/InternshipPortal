import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { verifyDocumentSchema } from "@/schemas/grading";
import { DocumentNotReadyForVerificationError, verifyDocument } from "@/server/grading/service";
import { Prisma } from "@prisma/client";

/** `deliverable.verify` (FOCAL) — BR-11: a real verification for one
 * document, mandatory method. Only accepted while the case is
 * PENDING_VERIFICATION. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "deliverable.verify");

    const body = await request.json().catch(() => null);
    const parsed = verifyDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const verification = await verifyDocument({
      documentId: id,
      method: parsed.data.method,
      note: parsed.data.note,
      verifiedBy: identity.userId,
    });

    return NextResponse.json(verification, { status: 201 });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (err instanceof DocumentNotReadyForVerificationError) {
      return NextResponse.json(
        { error: "invalid_state", state: err.state },
        { status: 409 },
      );
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
