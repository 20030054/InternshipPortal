import { signIn } from "@/server/auth/config";

// Minimal, deliberately unstyled. Auth.js's `pages.signIn` config
// (src/server/auth/config.ts) points here so it has somewhere real to
// send a browser rather than 404ing; M13 replaces this with the designed
// screen from MASTER_PROMPT.md §10. Not the point of M02.
export default function LoginPage() {
  async function loginAction(formData: FormData) {
    "use server";
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="font-serif text-2xl text-deep">Sign in</h1>
      <form action={loginAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Email
          <input
            type="email"
            name="email"
            required
            className="rounded border border-muted/40 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Password
          <input
            type="password"
            name="password"
            required
            className="rounded border border-muted/40 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded bg-deep px-4 py-2 text-white"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
