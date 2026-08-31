"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * M15: `POST /api/cases` takes no body and returns the new case
 * (`{id, ...}`) — the one action in this whole module that can't use
 * `ActionForm` unmodified, since success here means navigating to a
 * URL (`/cases/:id`) that didn't exist a moment ago, not just
 * `router.refresh()`ing the current one.
 */
export function OpenCaseButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/cases", { method: "POST", credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? body?.error ?? `Request failed (${response.status}).`);
        setPending(false);
        return;
      }
      router.push(`/cases/${body.id}`);
    } catch {
      setError("Network error — please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={pending}>
        {pending ? "Starting…" : "Start your internship case"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
