import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { createArchiveSchema } from "@/schemas/retention";
import { createDocumentArchive, EmptyArchiveError, listDocumentArchives } from "@/server/documents/retention";

/** OQ-07, answered (D-123): step one of three — bundle a year's
 * not-yet-archived documents into a new `DocumentArchive` row. Doesn't
 * touch the filesystem; see `[id]/download` (step two) and
 * `[id]/confirm-purge` (step three, the actual deletion gate). */
export async function GET() {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const archives = await listDocumentArchives();
    return NextResponse.json(archives);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "users.manage");

    const body = await request.json().catch(() => null);
    const parsed = createArchiveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const archive = await createDocumentArchive(parsed.data.year, identity.userId);
    return NextResponse.json(archive, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyArchiveError) {
      return NextResponse.json({ error: "nothing_to_archive", year: err.year }, { status: 409 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
