import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { listActivityLog } from "@/server/admin/activity-log";

/** "Admin can view each one's activity" — merges `audit_events` and
 * `case_events` (see `listActivityLog()`'s own doc comment). */
export async function GET(request: Request) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const url = new URL(request.url);
    const actorEmail = url.searchParams.get("actorEmail") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const entries = await listActivityLog({ actorEmail, limit });
    return NextResponse.json(entries);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
