import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { issueSupervisorTokenSchema } from "@/schemas/supervisor";
import { InvalidCaseStateError, issueSupervisorToken } from "@/server/supervisor/service";
import { supervisorTokenEmail } from "@/server/mail/supervisor-token-email";
import { sendMail } from "@/server/mail/transport";
import { Prisma } from "@prisma/client";

/**
 * `supervisor_token.issue` (M02's capability, unused until now): issues
 * a fresh token, or a replacement if one is already live for this case
 * — the same operation either way, since the service always revokes any
 * live token first. See docs/modules/M08.md "Scope decisions."
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const rawIdentity = await getCurrentIdentity();
    const identity = requireCapability(rawIdentity, "supervisor_token.issue");

    const body = await request.json().catch(() => null);
    const parsed = issueSupervisorTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { token, rawToken } = await issueSupervisorToken({
      caseId: id,
      supervisorEmail: parsed.data.supervisorEmail,
      issuedBy: identity.userId,
    });

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const evaluationUrl = `${appUrl}/supervisor/evaluate?token=${rawToken}`;
    const { subject, text } = supervisorTokenEmail(evaluationUrl);
    try {
      await sendMail({ to: parsed.data.supervisorEmail, subject, text });
    } catch {
      // M15: a real gap found live-verifying the new action-taking UI
      // against a genuinely unreachable SMTP relay — an unhandled
      // `sendMail()` rejection here previously 500'd the whole
      // request with no distinguishable cause, even though
      // `issueSupervisorToken()` above had already committed a real,
      // usable token to the database. Silently swallowing this
      // instead (returning 200 as if the email went out) would be
      // worse: the Focal Person would believe the supervisor was
      // notified when they weren't, with nothing prompting a retry.
      // A clear, distinct status does — and re-calling this route is
      // always safe (`issueSupervisorToken()`'s own doc comment: "the
      // same operation either way, since the service always revokes
      // any live token first"), so the caller can just try again once
      // the relay is reachable, without creating a second live token.
      return NextResponse.json({ error: "mail_unavailable" }, { status: 503 });
    }

    return NextResponse.json({
      id: token.id,
      caseId: token.caseId,
      supervisorEmail: token.supervisorEmail,
      expiresAt: token.expiresAt,
    });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    if (err instanceof InvalidCaseStateError) {
      return NextResponse.json(
        { error: "invalid_state", state: err.state },
        { status: 409 },
      );
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw err;
  }
}
