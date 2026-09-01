"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/admin/documents/archive` (OQ-07, D-123) — step one of
 * three. Custom, not `ActionForm`: a `409 nothing_to_archive` is a
 * real, expected outcome (every document for that year is already
 * archived or none exist), not an error to show the way `ActionForm`
 * shows one. */
export function CreateArchiveForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const form = event.currentTarget;
    const year = Number((form.elements.namedItem("year") as HTMLInputElement).value);
    try {
      const response = await fetch("/api/admin/documents/archive", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        setMessage(`Nothing to archive for ${year} — every document is already archived, or none exist.`);
        return;
      }
      if (!response.ok) {
        setMessage(body?.message ?? body?.error ?? `Failed (${response.status}).`);
        return;
      }
      setMessage(`Archive created: ${body.documentCount} document(s) for ${year}.`);
      form.reset();
      router.refresh();
    } catch {
      setMessage("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardTitle>Create a year-end archive</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Bundles every not-yet-archived document from that year into a downloadable zip. The
        underlying files are only ever deleted once you explicitly confirm you&apos;ve downloaded
        and saved the archive — nothing here deletes anything by itself.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-3">
        <Field label="Year" name="year" type="number" required defaultValue={new Date().getFullYear() - 1} />
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Creating…" : "Create archive"}
        </Button>
      </form>
      {message && <p className="mt-2 text-sm text-ink">{message}</p>}
    </Card>
  );
}
