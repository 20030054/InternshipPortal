import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";
import { submitOfferSchema } from "@/schemas/offers";
import { submitOffer } from "@/server/offers/service";
import {
  CaseNotFoundError,
  IllegalTransitionError,
  MissingReasonError,
  TransitionGuardError,
  WrongActorRoleError,
} from "@/server/state-machine/executor";
import {
  EmptyFileError,
  FileContentMismatchError,
  FileTooLargeError,
  UnsupportedFileTypeError,
} from "@/server/documents/store";
import { InfectedFileError, ScanUnavailableError } from "@/server/documents/clamav";
import { checkUploadRateLimit } from "@/server/security/rate-limit";

/** `case.open`: same capability as POST /api/cases — MASTER_PROMPT.md
 * §3's "Open case / upload offer letter" is one row/one capability.
 * Handles both first submission and resubmission after rejection; see
 * docs/modules/M05.md. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.open");

    const rate = await checkUploadRateLimit(identity.userId);
    if (!rate.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

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

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "invalid_request", message: "Expected multipart/form-data." },
        { status: 400 },
      );
    }

    const offerLetterFile = formData.get("offerLetter");
    if (!offerLetterFile || !(offerLetterFile instanceof File)) {
      return NextResponse.json(
        { error: "invalid_request", message: "Expected an 'offerLetter' file field." },
        { status: 400 },
      );
    }

    const parsed = submitOfferSchema.safeParse({
      companyName: formData.get("companyName"),
      companyContact: formData.get("companyContact"),
      workDescription: formData.get("workDescription"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await submitOffer({
      caseId: id,
      actor: { userId: identity.userId, roles: identity.roles },
      companyName: parsed.data.companyName,
      companyContact: parsed.data.companyContact,
      workDescription: parsed.data.workDescription,
      offerLetterFile,
    });

    return NextResponse.json(updated);
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
        { error: "offer_incomplete", reasons: err.reasons },
        { status: 422 },
      );
    }
    throw err;
  }
}
