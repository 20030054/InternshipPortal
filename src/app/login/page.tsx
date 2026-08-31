import { signIn } from "@/server/auth/config";
import { Button } from "@/components/ui/button";

// §10's design direction, finally applied — M02's own comment already
// pointed here: "M13 replaces this with the designed screen."
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">
          School of Computer &amp; Information Technology · BNU
        </p>
        <h1 className="mt-1 font-serif text-2xl text-deep">Sign in</h1>
      </div>
      <form action={loginAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded border border-muted/40 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mid"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded border border-muted/40 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mid"
          />
        </label>
        <Button type="submit" className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </main>
  );
}
