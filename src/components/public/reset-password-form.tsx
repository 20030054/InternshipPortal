"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * `POST /api/auth/password-reset/confirm` — `src/schemas/auth.ts`'s
 * `passwordResetConfirmSchema` (token, newPassword). Backs both the
 * self-service "forgot password" flow and every new-staff-account
 * welcome email (`src/server/users/service.ts`'s `createStaffUser()`)
 * — the same one-time-link mechanism either way (D-091's reasoning:
 * "the same mechanism as forgot password").
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const newPassword = (event.currentTarget.elements.namedItem("newPassword") as HTMLInputElement)
      .value;

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          body?.error === "invalid_token"
            ? "This link is invalid or has expired — request a new one below."
            : body?.error === "weak_password"
              ? body.message ?? "That password is too short."
              : `Something went wrong (${response.status}).`,
        );
        return;
      }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink">
          Your password has been set. Every session that was signed in before this is now signed
          out — sign in again with your new password.
        </p>
        <Link href="/login">
          <Button className="w-full">Go to sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        label="New password (at least 12 characters)"
        name="newPassword"
        type="password"
        minLength={12}
        required
        autoComplete="new-password"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
          {error.startsWith("This link") && (
            <>
              {" "}
              <Link href="/forgot-password" className="underline-offset-2 hover:underline">
                Request a new link
              </Link>
              .
            </>
          )}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Setting password…" : "Set password"}
      </Button>
    </form>
  );
}
