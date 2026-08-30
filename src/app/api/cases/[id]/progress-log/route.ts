import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import {
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";
import { addProgressLogEntrySchema } from "@/schemas/progress";
import { addProgressLogEntry, DuplicateWeekError, getProgressLog } from "@/server/progress/service";

/** `case.progress_log_update`: MASTER_PROMPT.md gives this capability no
 * route of its own until now (M02 declared it, unused since). Entries
 * are only accepted while IN_PROGRESS — see docs/modules/M07.md "Scope
 * decisions." */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.progress_log_update");

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
    if (kase.state !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "invalid_state", state: kase.state },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = addProgressLogEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const entry = await addProgressLogEntry({
      caseId: id,
      weekNumber: parsed.data.weekNumber,
      note: parsed.data.note,
      createdBy: identity.userId,
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (err instanceof DuplicateWeekError) {
      return NextResponse.json(
        { error: "duplicate_week", weekNumber: err.weekNumber },
        { status: 409 },
      );
    }
    throw err;
  }
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

    const kase = await prisma.case.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!kase) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (ownershipRequired) {
      const student = await prisma.student.findUnique({
        where: { userId: identity.userId },
        select: { id: true },
      });
      if (student?.id !== kase.studentId) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
    }

    const log = await getProgressLog(id);
    return NextResponse.json(log);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
