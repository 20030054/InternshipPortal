"use client";

import { useEffect, useState, type FormEvent } from "react";
import { TextAreaField, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

type LiveView = {
  studentDisplayName: string;
  companyName: string;
  plannedStart: string | null;
  plannedEnd: string | null;
};

type PageState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "already_submitted" }
  | { kind: "live"; view: LiveView }
  | { kind: "submitted" };

/**
 * The real page behind the link `supervisorTokenEmail()` (M08) sends —
 * `GET`/`POST /api/supervisor/evaluate/:token` have been fully built
 * and tested since M08; no page rendered them until now, so the actual
 * emailed link 404'd for every real supervisor. No login, no session —
 * possession of the token is the only proof of authorization this
 * route (or this page) ever checks.
 *
 * §9 "Privacy": "Supervisor-facing pages leak nothing beyond the
 * student's name, the company and the dates" — `LiveView` is exactly,
 * only, that shape; there is nothing else on this page to leak.
 */
export function SupervisorEvaluateForm({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/supervisor/evaluate/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setState({ kind: "invalid" });
          return;
        }
        const body = await response.json();
        if (body.status === "already_submitted") {
          setState({ kind: "already_submitted" });
        } else if (body.status === "live") {
          setState({ kind: "live", view: body });
        } else {
          setState({ kind: "invalid" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = event.currentTarget;
    const performanceRating = Number(
      (form.elements.namedItem("performanceRating") as HTMLSelectElement).value,
    );
    const comments = (form.elements.namedItem("comments") as HTMLTextAreaElement).value.trim();

    try {
      const response = await fetch(`/api/supervisor/evaluate/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ performanceRating, comments }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? body?.error ?? `Something went wrong (${response.status}).`);
        return;
      }
      if (body?.status === "already_submitted") {
        setState({ kind: "already_submitted" });
        return;
      }
      setState({ kind: "submitted" });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPending(false);
    }
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (state.kind === "invalid") {
    return (
      <p className="text-sm text-danger">
        This link is invalid or has expired. Contact the student&apos;s Focal Person for a fresh
        one.
      </p>
    );
  }

  if (state.kind === "already_submitted") {
    return <p className="text-sm text-ink">An evaluation has already been submitted for this link.</p>;
  }

  if (state.kind === "submitted") {
    return <p className="text-sm text-ink">Thank you — the evaluation has been submitted.</p>;
  }

  const { view } = state;
  return (
    <Card>
      <CardTitle>{view.studentDisplayName}</CardTitle>
      <p className="mt-1 text-sm text-muted">
        {view.companyName}
        {view.plannedStart && view.plannedEnd && (
          <>
            {" "}
            · {new Date(view.plannedStart).toLocaleDateString()} –{" "}
            {new Date(view.plannedEnd).toLocaleDateString()}
          </>
        )}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <SelectField label="Performance rating" name="performanceRating" required defaultValue="">
          <option value="" disabled>
            Choose a rating
          </option>
          <option value="1">1 — Poor</option>
          <option value="2">2 — Below expectations</option>
          <option value="3">3 — Meets expectations</option>
          <option value="4">4 — Exceeds expectations</option>
          <option value="5">5 — Outstanding</option>
        </SelectField>
        <TextAreaField label="Comments" name="comments" required />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Submitting…" : "Submit evaluation"}
        </Button>
      </form>
    </Card>
  );
}
