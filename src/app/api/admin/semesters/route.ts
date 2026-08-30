import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { prisma } from "@/server/db/client";
import { createSemesterSchema } from "@/schemas/roster";
import { createSemester } from "@/server/roster/semesters";

export async function GET() {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const semesters = await prisma.semester.findMany({
      orderBy: { sequenceNumber: "asc" },
    });
    return NextResponse.json(semesters);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const body = await request.json().catch(() => null);
    const parsed = createSemesterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const semester = await createSemester({
      type: parsed.data.type,
      year: parsed.data.year,
      startsOn: new Date(parsed.data.startsOn),
      endsOn: new Date(parsed.data.endsOn),
      documentDeadline: parsed.data.documentDeadline
        ? new Date(parsed.data.documentDeadline)
        : null,
      sequenceNumber: parsed.data.sequenceNumber,
    });

    return NextResponse.json(semester, { status: 201 });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
