import Link from "next/link";
import { ResetPasswordForm } from "@/components/public/reset-password-form";

/** Public, no session required. `?token=` comes from the emailed link
 * — both `passwordResetEmail()` (forgot-password) and
 * `staffWelcomeEmail()` (new staff accounts, D-097) point here. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">
          School of Computer &amp; Information Technology · BNU
        </p>
        <h1 className="mt-1 font-serif text-2xl text-deep">Set your password</h1>
      </div>

      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-danger">
            This page needs a reset link — use the one from your email, or request a fresh one.
          </p>
          <Link href="/forgot-password" className="text-sm text-mid underline-offset-2 hover:underline">
            Request a reset link →
          </Link>
        </div>
      )}
    </main>
  );
}
