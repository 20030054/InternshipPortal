"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

type ImportResult = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
};

/**
 * `POST /api/admin/roster/import` always `200`s with a per-row summary
 * (`ImportResult`) even when some rows failed — a partial success, not
 * an error the generic `ActionForm` (which only surfaces detail on a
 * non-2xx response) can show. Custom, small, for that one reason —
 * same shape as `InitiateWaiverForm`'s own reasoning.
 */
export function RosterImportForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    const form = event.currentTarget;
    try {
      const response = await fetch("/api/admin/roster/import", {
        method: "POST",
        credentials: "same-origin",
        body: new FormData(form),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message ?? body?.error ?? `Import failed (${response.status}).`);
        return;
      }
      setResult(body as ImportResult);
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
      <CardTitle>Import roster (CSV)</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Columns: registrationNumber, email, programme, admissionSemesterType,
        admissionSemesterYear, and optionally fullName. The referenced semester must already
        exist below.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <Field label="CSV file" name="file" type="file" accept=".csv,text/csv" required />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {result && (
          <div className="rounded border border-deep/10 bg-tint p-3 text-sm text-ink">
            <p>
              {result.totalRows} row{result.totalRows === 1 ? "" : "s"}: {result.createdCount}{" "}
              created, {result.updatedCount} updated, {result.errorCount} failed.
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-danger">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Importing…" : "Import"}
        </Button>
      </form>
    </Card>
  );
}
