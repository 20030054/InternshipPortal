import Link from "next/link";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { rolesGrantCapability } from "@/server/authz/matrix";
import { signOut } from "@/server/auth/config";

/**
 * The one piece of shared chrome every authenticated page renders
 * through — rendered from the root layout (`src/app/layout.tsx`), not
 * per-page, so every page (including new ones) gets it automatically
 * rather than each screen wiring its own nav/logout by hand. Renders
 * nothing at all when there's no session — the login/forgot-password/
 * reset-password/supervisor-evaluate pages are all genuinely public
 * and shouldn't show a logged-in-user's header.
 *
 * A real, previously-missing gap: `signOut` (`src/server/auth/
 * config.ts`) has existed since M02 with nothing anywhere calling it —
 * there was no way to log out of this portal except clearing cookies
 * by hand.
 *
 * `homeHref` mirrors `src/app/page.tsx`'s own role-dispatch order
 * exactly (FOCAL -> HOD -> DEAN -> ADMIN -> STUDENT/"/") — one small
 * duplication of a four-line `if` chain, not worth a shared helper
 * module for.
 */
export async function AppHeader() {
  const identity = await getCurrentIdentity();
  if (!identity) return null;

  let homeHref = "/";
  if (rolesGrantCapability(identity.roles, "dashboard.view_focal")) homeHref = "/focal";
  else if (rolesGrantCapability(identity.roles, "dashboard.view_hod")) homeHref = "/hod";
  else if (rolesGrantCapability(identity.roles, "dashboard.view_dean")) homeHref = "/dean";
  else if (rolesGrantCapability(identity.roles, "users.manage")) homeHref = "/admin";

  const canSeeWaivers = rolesGrantCapability(identity.roles, "case.view_any");

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="border-b border-deep/10 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href={homeHref} className="font-serif text-base text-deep">
          SCIT Internship Portal
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href={homeHref} className="text-mid underline-offset-2 hover:underline">
            Dashboard
          </Link>
          {canSeeWaivers && (
            <Link href="/waivers" className="text-mid underline-offset-2 hover:underline">
              Waivers
            </Link>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-muted underline-offset-2 hover:text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mid"
            >
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
