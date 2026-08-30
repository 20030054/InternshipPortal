import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { closeSemester } from "@/server/roster/semesters";
import { Prisma } from "@prisma/client";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const semester = await closeSemester(id);
    return NextResponse.json(semester);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
