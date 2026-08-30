import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { initiateWaiverSchema } from "@/schemas/waivers";
import {
  AlreadyHasActiveCaseError,
  AlreadyHasWaiverError,
  initiateWaiver,
} from "@/server/waivers/service";
import {
  EmptyFileError,
  FileContentMismatchError,
  FileTooLargeError,
  UnsupportedFileTypeError,
} from "@/server/documents/store";
import { InfectedFileError, ScanUnavailableError } from "@/server/documents/clamav";
import { Prisma } from "@prisma/client";

/** `waiver.initiate` (FOCAL): genesis-inserts a new Case in
 * WAIVER_REQUESTED (BR-21/22). Multipart — `circumstance`/`reason` text
 * fields plus an `evidence` file, mirroring M05's offer-submission
 * route. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "waiver.initiate");

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "invalid_request", message: "Expected multipart/form-data." },
        { status: 400 },
      );
    }

    const evidenceFile = formData.get("evidence");
    if (!evidenceFile || !(evidenceFile instanceof File)) {
      return NextResponse.json(
        { error: "invalid_request", message: "Expected an 'evidence' file field." },
        { status: 400 },
      );
    }

    const parsed = initiateWaiverSchema.safeParse({
      circumstance: formData.get("circumstance"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await initiateWaiver({
      studentId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      circumstance: parsed.data.circumstance,
      reason: parsed.data.reason,
      evidenceFile,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (
      err instanceof EmptyFileError ||
      err instanceof FileTooLargeError ||
      err instanceof UnsupportedFileTypeError ||
      err instanceof FileContentMismatchError
    ) {
      return NextResponse.json(
        { error: "invalid_file", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof InfectedFileError) {
      return NextResponse.json({ error: "file_rejected_by_scan" }, { status: 422 });
    }
    if (err instanceof ScanUnavailableError) {
      return NextResponse.json({ error: "scan_unavailable" }, { status: 503 });
    }
    if (err instanceof AlreadyHasWaiverError || err instanceof AlreadyHasActiveCaseError) {
      return NextResponse.json({ error: "invalid_state", message: err.message }, { status: 409 });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2025" || err.code === "P2003")
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "invalid_state", message: "waiver already exists" }, { status: 409 });
    }
    throw err;
  }
}
