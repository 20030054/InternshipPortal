import { NextResponse } from "next/server";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { authzErrorResponse } from "@/server/authz/error-response";
import { sendCredentialsSchema } from "@/schemas/roster";
import { studentCredentialsEmail } from "@/server/mail/student-credentials-email";
import { sendMail } from "@/server/mail/transport";

/**
 * OQ-05, answered (D-122): the second half of the credentials
 * workflow — `POST /api/admin/roster/import`'s response carries each
 * newly-created student's real password back to the Admin's browser
 * once; this route is what actually emails it out, individually or in
 * bulk (the Admin's own UI decides which — this route only ever sees
 * whatever list it's given). No persistence of the plaintext anywhere
 * server-side, before or after this call.
 */
export async function POST(request: Request) {
  try {
    const identity = await getCurrentIdentity();
    requireCapability(identity, "users.manage");

    const body = await request.json().catch(() => null);
    const parsed = sendCredentialsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const loginUrl = `${appUrl}/login`;

    const results: { email: string; sent: boolean }[] = [];
    for (const recipient of parsed.data.recipients) {
      const { subject, text } = studentCredentialsEmail(recipient.email, recipient.password, loginUrl);
      try {
        await sendMail({ to: recipient.email, subject, text });
        results.push({ email: recipient.email, sent: true });
      } catch {
        // M15's own lesson (supervisor-token route, same session): an
        // unreachable SMTP relay must produce a distinguishable
        // per-recipient failure, not a 500 that leaves the Admin
        // guessing which of a whole batch actually went out.
        results.push({ email: recipient.email, sent: false });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const response = authzErrorResponse(err);
    if (response) return response;
    throw err;
  }
}
