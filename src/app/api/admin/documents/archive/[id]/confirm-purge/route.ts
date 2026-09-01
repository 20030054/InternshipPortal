import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { ArchiveNotFoundError, confirmArchivePurge } from "@/server/documents/retention";

/** OQ-07, answered (D-123): step three — the actual, only, deletion
 * gate. Only the file bytes are removed; the `Document` row,
 * checksum, and every `Verification` against it stay forever (§9). No
 * automatic trigger anywhere calls this — an explicit Admin click on
 * an Admin-reviewed archive is the only path here. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const result = await confirmArchivePurge(id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ArchiveNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
