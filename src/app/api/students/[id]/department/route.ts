import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { updateStudentDepartmentSchema } from "@/schemas/students";
import { prisma } from "@/server/db/client";

/** D-127: Admin correcting a student's department after roster import
 * (a wrong department on the CSV row, a transfer between departments,
 * ...). `users.manage` — the same admin-config capability every other
 * roster/admin route reuses. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateStudentDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const student = await prisma.student.update({
      where: { id },
      data: { department: parsed.data.department },
    });
    return NextResponse.json({ id: student.id, department: student.department });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
