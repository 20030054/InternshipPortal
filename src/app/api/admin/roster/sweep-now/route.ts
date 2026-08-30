import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { runAutoEnrollmentSweep } from "@/server/roster/auto-enrollment-sweep";

/**
 * Manually triggers BR-02's auto-enrollment sweep — the same function
 * the scheduled BullMQ job calls (worker/index.ts). For ops/testing; not
 * a substitute for the schedule, since BR-02 requires the sweep to run
 * "without a login" regardless of whether anyone ever calls this route.
 */
export async function POST() {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const result = await runAutoEnrollmentSweep();
    return NextResponse.json(result);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
