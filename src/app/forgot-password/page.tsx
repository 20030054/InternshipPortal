import Link from "next/link";
import { ForgotPasswordForm } from "@/components/public/forgot-password-form";

/** Public, no session required — the request half of the password-
 * reset flow. `src/schemas/auth.ts`'s own doc comment named this page
 * as "future" since M02; never built until now. */
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">
          School of Computer &amp; Information Technology · BNU
        </p>
        <h1 className="mt-1 font-serif text-2xl text-deep">Reset your password</h1>
        <p className="mt-2 text-sm text-muted">
          Enter the email your account uses — we&apos;ll send a link to set a new password.
        </p>
      </div>

      <ForgotPasswordForm />

      <Link href="/login" className="text-sm text-mid underline-offset-2 hover:underline">
        ← Back to sign in
      </Link>
    </main>
  );
}
