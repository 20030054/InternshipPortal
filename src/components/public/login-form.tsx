"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROLES = [
  { key: "student", label: "Student" },
  { key: "focal", label: "Focal Person" },
  { key: "hod", label: "HoD" },
  { key: "dean", label: "Dean" },
  { key: "admin", label: "Admin" },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];

/**
 * The role picker is deliberately cosmetic only — it changes nothing
 * about what this form submits (still just email + password, the same
 * fields and the same server action for every choice) and nothing
 * about what happens after sign-in. `src/app/page.tsx`'s own role-
 * dispatch already decides that from the account's *real* roles, read
 * fresh from the database on every request — never from anything a
 * login form could claim. Picking "Admin" here and signing in with a
 * Student-only account still lands on the student home page; this is
 * the whole point, not a bug — identity/authorization in this
 * codebase never comes from client input (D-004, §9).
 *
 * It exists purely so each kind of user sees a login screen that
 * speaks to them ("Sign in as Focal Person") rather than one generic
 * form serving five audiences with no acknowledgement of which one
 * they are.
 */
export function LoginForm({ action }: { action: (formData: FormData) => void }) {
  const [role, setRole] = useState<RoleKey>("student");
  const roleLabel = ROLES.find((r) => r.key === role)!.label;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted">I am signing in as</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              aria-pressed={role === r.key}
              className={cn(
                "rounded border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mid",
                role === r.key
                  ? "border-deep bg-deep text-white"
                  : "border-deep/20 bg-white text-deep hover:bg-tint",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h1 className="font-serif text-2xl text-deep">Sign in as {roleLabel}</h1>
      </div>

      <form action={action} className="flex flex-col gap-4">
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
    </div>
  );
}
