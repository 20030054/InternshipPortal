import { NextResponse } from "next/server";
import { submitEvaluationSchema } from "@/schemas/supervisor";
import { lookupSupervisorToken, submitEvaluation } from "@/server/supervisor/service";
import { checkRateLimit } from "@/server/security/rate-limit";
import { advanceToVerificationIfReady } from "@/server/grading/service";

/**
 * Public, no-login routes — MASTER_PROMPT.md §2.5: the Industry
 * Supervisor "receives a signed, single-use, expiring link tied to one
 * case... can view the student name, company name and internship dates
 * only, and submit the evaluation form once." Excluded from the
 * mutating-route ESLint rule (eslint.config.mjs) the same way
 * src/app/api/auth/** is — there is no identity here to call
 * requireCapability() against.
 *
 * `invalid` (not-found/expired/revoked) and `already_submitted` are
 * deliberately different response shapes on both GET and POST — this
 * module's own stated done criterion: "a used token returns a clean
 * 'already submitted' page and a replayed token is rejected."
 */

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const rate = await checkRateLimit(`supervisor-token-view:${clientIp(request)}`, 20, 60 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const result = await lookupSupervisorToken(token);
  if (result.status === "invalid") {
    return NextResponse.json({ status: "invalid" }, { status: 404 });
  }
  if (result.status === "already_submitted") {
    return NextResponse.json({ status: "already_submitted" }, { status: 200 });
  }
  return NextResponse.json({ status: "live", ...result.view });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const rate = await checkRateLimit(`supervisor-token-submit:${clientIp(request)}`, 5, 60 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = submitEvaluationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await submitEvaluation({
    rawToken: token,
    performanceRating: parsed.data.performanceRating,
    comments: parsed.data.comments,
  });

  if (result.status === "invalid") {
    return NextResponse.json({ status: "invalid" }, { status: 404 });
  }
  if (result.status === "already_submitted") {
    return NextResponse.json({ status: "already_submitted" }, { status: 200 });
  }
  await advanceToVerificationIfReady(result.caseId);
  return NextResponse.json({ status: "submitted" }, { status: 201 });
}
