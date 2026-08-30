import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import {
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";

/**
 * MASTER_PROMPT.md §9: "Downloads stream through an authenticated
 * handler with Content-Disposition: attachment and X-Content-Type-
 * Options: nosniff." Reuses case.view_own/case.view_any — see
 * docs/modules/M06.md "Scope decisions" for why no new capability was
 * added. Every attempt against a *real* document (success or denial)
 * writes an audit_events row (BR-26); a nonexistent id has nothing real
 * to log against and just 404s.
 */

function sanitizeForHeader(filename: string): string {
  // Strips CR/LF (header injection) and quotes; MASTER_PROMPT.md §9
  // already forbids using this value to build a filesystem path — this
  // is the separate, narrower concern of putting it safely in a header.
  return filename.replace(/[\r\n"]/g, "").trim() || "download";
}

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

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        caseId: true,
        storageKey: true,
        originalFilename: true,
        case: { select: { studentId: true } },
      },
    });
    if (!document) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (ownershipRequired) {
      const student = await prisma.student.findUnique({
        where: { userId: identity.userId },
        select: { id: true },
      });
      if (student?.id !== document.case.studentId) {
        await prisma.auditEvent.create({
          data: {
            actorUserId: identity.userId,
            eventType: "DOCUMENT_DOWNLOAD_DENIED",
            entityType: "document",
            entityId: document.id,
            metadata: { reason: "not the owning student" },
          },
        });
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
    }

    await prisma.auditEvent.create({
      data: {
        actorUserId: identity.userId,
        eventType: "DOCUMENT_DOWNLOADED",
        entityType: "document",
        entityId: document.id,
        metadata: { caseId: document.caseId },
      },
    });

    const uploadDir = process.env.UPLOAD_DIR;
    if (!uploadDir) {
      throw new Error("UPLOAD_DIR is not set — nowhere to read uploaded files from.");
    }
    // storageKey is always our own randomUUID() (see documents/store.ts)
    // — never client input — so this path is not attacker-controlled.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const nodeStream = createReadStream(path.join(uploadDir, document.storageKey));
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const filename = sanitizeForHeader(document.originalFilename);
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Type": "application/octet-stream",
      },
    });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
