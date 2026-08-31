"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextAreaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

/**
 * `POST /api/students/:id/waiver` needs the student's internal id, not
 * their registration number — so this form does what
 * `src/server/students/lookup.ts` exists for: resolve the registration
 * number first, then submit, as one button press. Not built on the
 * generic `ActionForm` (`src/components/action-form.tsx`) — that
 * component's whole shape is "one submit, one request"; this is
 * genuinely two requests chained, so it has its own small
 * fetch/loading/error handling instead of forcing that shape to fit.
 */
export function InitiateWaiverForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = event.currentTarget;
    const registrationNumber = (form.elements.namedItem("registrationNumber") as HTMLInputElement).value.trim();
    const circumstance = (form.elements.namedItem("circumstance") as HTMLTextAreaElement).value.trim();
    const reason = (form.elements.namedItem("reason") as HTMLTextAreaElement).value.trim();
    const evidenceInput = form.elements.namedItem("evidence") as HTMLInputElement;
    const evidence = evidenceInput.files?.[0];

    try {
      const lookupResponse = await fetch(
        `/api/students/lookup?registrationNumber=${encodeURIComponent(registrationNumber)}`,
        { credentials: "same-origin" },
      );
      if (!lookupResponse.ok) {
        setError(
          lookupResponse.status === 404
            ? `No student found with registration number "${registrationNumber}".`
            : `Lookup failed (${lookupResponse.status}).`,
        );
        return;
      }
      const student: { id: string; name: string } = await lookupResponse.json();

      const body = new FormData();
      body.set("circumstance", circumstance);
      body.set("reason", reason);
      if (evidence) body.set("evidence", evidence);

      const initiateResponse = await fetch(`/api/students/${student.id}/waiver`, {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      if (!initiateResponse.ok) {
        const responseBody = await initiateResponse.json().catch(() => null);
        setError(
          responseBody?.message ??
            responseBody?.error ??
            `Could not initiate the waiver for ${student.name} (${initiateResponse.status}).`,
        );
        return;
      }

      form.reset();
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardTitle>Initiate a waiver</CardTitle>
      <p className="mt-1 text-sm text-muted">
        On the student&apos;s behalf, for a genuinely exceptional circumstance (BR-22) — not
        ordinary prior work experience. At most one waiver per student, ever.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <Field label="Student registration number" name="registrationNumber" type="text" required />
        <TextAreaField
          label="Circumstance (at least 300 characters)"
          name="circumstance"
          minLength={300}
          required
          className="min-h-32"
        />
        <TextAreaField label="Reason" name="reason" required />
        <Field
          label="Supporting evidence (PDF, JPEG or PNG)"
          name="evidence"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Submitting…" : "Initiate waiver"}
        </Button>
      </form>
    </Card>
  );
}
