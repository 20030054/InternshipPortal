import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { ArchiveNotFoundError, streamArchiveZip } from "@/server/documents/retention";

/** OQ-07, answered (D-123): step two of three — re-callable as many
 * times as needed (nothing is deleted here); see `confirm-purge` for
 * the actual deletion gate. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const nodeStream = await streamArchiveZip(id);
    const webStream = Readable.toWeb(nodeStream as Readable) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="documents-archive-${id}.zip"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Type": "application/zip",
      },
    });
  } catch (err) {
    if (err instanceof ArchiveNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
