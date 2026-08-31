"use client";

import { useState, type FormEvent } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * `POST /api/auth/password-reset/request` — the route the schema's
 * own doc comment (`src/schemas/auth.ts`) already called out as
 * waiting on "the (future) client-side form." Always returns the same
 * `200 {status: "ok"}` regardless of whether the account exists
 * (email-enumeration protection) — this form matches that: one
 * success message, no branching on what actually happened server-side,
 * since this page genuinely can't know and shouldn't ask.
 */
export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const email = (event.currentTarget.elements.namedItem("email") as HTMLInputElement).value;

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.status === 429) {
        setError("Too many attempts — please wait a while and try again.");
        return;
      }
      // Every other outcome (200, or a malformed email caught by the
      // route's own validation) shows the same message on purpose.
      setSubmitted(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <p className="text-sm text-ink">
        If an account exists for that email, a link to reset your password is on its way — it
        expires in 1 hour and works once.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
