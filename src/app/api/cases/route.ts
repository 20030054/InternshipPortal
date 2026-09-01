import { NextResponse } from "next/server";
import type { CaseState } from "@prisma/client";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { allowedDepartmentsFor } from "@/server/authz/department-scope";
import { prisma } from "@/server/db/client";
import {
  AlreadyHasActiveCaseError,
  CannotReopenError,
  NotEligibleError,
  openCase,
} from "@/server/offers/service";

const CASE_STATES: readonly CaseState[] = [
  "ELIGIBILITY_PENDING",
  "ELIGIBLE",
  "OFFER_SUBMITTED",
  "OFFER_UNDER_REVIEW",
  "OFFER_REJECTED",
  "APPROVED",
  "IN_PROGRESS",
  "DOCS_PENDING",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "GRADE_RECOMMENDED",
  "CLOSED_PASS",
  "CLOSED_INCOMPLETE",
  "WITHDRAWN",
  "RESTART_REQUESTED",
  "RESTART_AUTHORIZED",
  "RESTART_DENIED",
  "WAIVER_REQUESTED",
  "WAIVER_COUNTERSIGNED",
  "WAIVER_GRANTED",
  "WAIVER_DENIED",
];

/**
 * `case.open`: MASTER_PROMPT.md §3's "Open case / upload offer letter"
 * row is one capability covering both actions — this route is the
 * "open" half. See docs/modules/M05.md "Scope decisions" for why this
 * finally wires ELIGIBILITY_PENDING -> ELIGIBLE (OQ-11).
 */
export async function POST() {
  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.open");

    const student = await prisma.student.findUnique({
      where: { userId: identity.userId },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json({ error: "not_a_student" }, { status: 404 });
    }

    const kase = await openCase(student.id);
    return NextResponse.json(kase, { status: 201 });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (err instanceof NotEligibleError) {
      return NextResponse.json({ error: "not_eligible" }, { status: 422 });
    }
    if (err instanceof AlreadyHasActiveCaseError) {
      return NextResponse.json({ error: "case_already_open" }, { status: 409 });
    }
    if (err instanceof CannotReopenError) {
      return NextResponse.json(
        { error: "cannot_reopen", state: err.state },
        { status: 409 },
      );
    }
    throw err;
  }
}

/** The Focal Person review queue (MASTER_PROMPT.md §7's M05 description)
 * — a plain filtered list. SLA-risk sorting is M13's job. */
export async function GET(request: Request) {
  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "case.view_any");

    const url = new URL(request.url);
    const stateParam = url.searchParams.get("state");
    if (stateParam && !CASE_STATES.includes(stateParam as CaseState)) {
      return NextResponse.json(
        { error: "invalid_request", message: "Unknown state filter." },
        { status: 400 },
      );
    }

    const departments = await allowedDepartmentsFor(identity);
    const cases = await prisma.case.findMany({
      where: {
        ...(stateParam ? { state: stateParam as CaseState } : {}),
        ...(departments ? { student: { department: { in: [...departments] } } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(cases);
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
