import Link from "next/link";
import { signIn } from "@/server/auth/config";
import { LoginForm } from "@/components/public/login-form";

// §10's design direction, finally applied — M02's own comment already
// pointed here: "M13 replaces this with the designed screen."
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  // Auth.js always redirects a failed credentials attempt with
  // `error=CredentialsSignin` — the *specific* reason lives in `code`,
  // which is where `AccountLockedError`/`RateLimitedError`'s own
  // overridden `code` property (`src/server/auth/authorize-
  // credentials.ts`) actually surfaces. A first draft of this page
  // checked `error` for those values directly, which never matches —
  // caught before shipping by re-deriving the exact redirect shape
  // observed live earlier this session (`?error=CredentialsSignin&
  // code=credentials`), not by assumption.
  const { error, code } = await searchParams;

  async function loginAction(formData: FormData) {
    "use server";
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">
          School of Computer &amp; Information Technology · BNU
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {code === "account_locked"
            ? "This account is temporarily locked after too many failed attempts — try again later."
            : code === "rate_limited"
              ? "Too many attempts — please wait a while and try again."
              : "Incorrect email or password."}
        </p>
      )}

      <LoginForm action={loginAction} />

      <Link href="/forgot-password" className="text-sm text-mid underline-offset-2 hover:underline">
        Forgot password?
      </Link>
    </main>
  );
}
