import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { DEPARTMENTS } from "@/schemas/users";
import { z } from "zod";
import { setUserDepartments } from "@/server/departments/service";

const updateDepartmentsSchema = z.object({
  departments: z.array(z.enum(DEPARTMENTS)),
});

/** D-127: Admin correcting a Focal/HoD account's department
 * assignment(s) after creation — replace-all semantics, see
 * `setUserDepartments()`'s own doc comment. An empty array is valid
 * and meaningful: it un-assigns the account entirely. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateDepartmentsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    await setUserDepartments(id, parsed.data.departments);
    return NextResponse.json({ status: "ok", departments: parsed.data.departments });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
