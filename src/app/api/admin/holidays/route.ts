import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { createHolidaySchema } from "@/schemas/holidays";
import { addHoliday, listHolidays } from "@/server/roster/holidays";
import { Prisma } from "@prisma/client";

/** OQ-14, answered (D-121): Admin-managed public holidays feeding
 * BR-27's SLA clock — `users.manage`, the same capability every other
 * admin-config route in this codebase reuses (roster import, semester
 * management), not a new narrow capability for one more config table. */
export async function GET() {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const holidays = await listHolidays();
    return NextResponse.json(holidays);
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
    const parsed = createHolidaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const holiday = await addHoliday(new Date(parsed.data.date), parsed.data.name);
    return NextResponse.json(holiday, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "date_already_a_holiday" }, { status: 409 });
    }
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
