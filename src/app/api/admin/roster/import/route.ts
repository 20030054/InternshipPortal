import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { importRoster } from "@/server/roster/csv-import";

export async function POST(request: Request) {
  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "users.manage");

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "invalid_request", message: "Expected a 'file' field with the CSV." },
        { status: 400 },
      );
    }

    const content = await file.text();
    const result = await importRoster(content, identity.userId, file.name);

    return NextResponse.json(result);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
