import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";
import {
  EmptyFileError,
  FileContentMismatchError,
  FileTooLargeError,
  storeDocument,
  UnsupportedFileTypeError,
} from "@/server/documents/store";
import { InfectedFileError, ScanUnavailableError } from "@/server/documents/clamav";
import { advanceToVerificationIfReady } from "@/server/grading/service";
import { checkUploadRateLimit } from "@/server/security/rate-limit";
import type { CaseState } from "@prisma/client";

/**
 * `document.upload_completion_certificate` (MASTER_PROMPT.md §3), a
 * capability M02 declared with no route since. Creates a `Document` row
 * and — new in M09 — checks whether this was the last of the three BR-10
 * deliverables to arrive, firing row 9 automatically if so. Never
 * advances `cases.state` on its own beyond that one real, guarded
 * transition (see docs/modules/M06.md's original "Scope decisions" for
 * why this route never invented its own state-advancing logic before
 * M09 existed to own it).
 */
const UPLOADABLE_STATES: readonly CaseState[] = ["IN_PROGRESS", "DOCS_PENDING"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "document.upload_completion_certificate");

    const rate = await checkUploadRateLimit(identity.userId);
    if (!rate.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const kase = await prisma.case.findUnique({
      where: { id },
      select: { studentId: true, state: true },
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
    if (!UPLOADABLE_STATES.includes(kase.state)) {
      return NextResponse.json(
        { error: "invalid_state", state: kase.state },
        { status: 409 },
      );
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "invalid_request", message: "Expected a 'file' field." },
        { status: 400 },
      );
    }

    const document = await storeDocument({
      caseId: id,
      type: "COMPLETION_CERTIFICATE",
      file,
      uploadedBy: identity.userId,
    });

    await advanceToVerificationIfReady(id);

    return NextResponse.json(document, { status: 201 });
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
    throw err;
  }
}
