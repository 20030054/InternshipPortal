"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

type NewCredential = { email: string; fullName: string | null; password: string };

type ImportResult = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  newCredentials: NewCredential[];
};

/** OQ-05, answered (D-122): a plain client-side download — the CSV
 * never touches the server again after the import response that
 * carried these passwords in the first place, so there's no separate
 * "download" endpoint to persist plaintext behind. */
function downloadCredentialsCsv(credentials: NewCredential[]) {
  const rows = [
    ["email", "fullName", "password"],
    ...credentials.map((c) => [c.email, c.fullName ?? "", c.password]),
  ];
  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `student-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<Record<string, "sent" | "failed">>({});

  async function sendCredentials(recipients: NewCredential[]) {
    setSending(true);
    try {
      const response = await fetch("/api/admin/roster/send-credentials", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: recipients.map((c) => ({ email: c.email, password: c.password })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.results) {
        const next: Record<string, "sent" | "failed"> = {};
        for (const r of body.results as { email: string; sent: boolean }[]) {
          next[r.email] = r.sent ? "sent" : "failed";
        }
        setSendStatus((prev) => ({ ...prev, ...next }));
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    setSendStatus({});

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

      {result && result.newCredentials.length > 0 && (
        <div className="mt-4 rounded border border-deep/10 bg-tint p-3">
          <p className="text-sm font-medium text-deep">
            {result.newCredentials.length} new student login{result.newCredentials.length === 1 ? "" : "s"}{" "}
            generated
          </p>
          <p className="mt-1 text-xs text-muted">
            Passwords are shown here once only — review before sending or downloading.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted">
                  <th className="py-1 pr-3">Email</th>
                  <th className="py-1 pr-3">Password</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {result.newCredentials.map((c) => (
                  <tr key={c.email} className="border-t border-deep/10">
                    <td className="py-1 pr-3">{c.email}</td>
                    <td className="py-1 pr-3 font-mono">{c.password}</td>
                    <td className="py-1 pr-3">
                      {sendStatus[c.email] === "sent"
                        ? "Sent"
                        : sendStatus[c.email] === "failed"
                          ? "Failed"
                          : "—"}
                    </td>
                    <td className="py-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={sending}
                        onClick={() => sendCredentials([c])}
                      >
                        Send
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={sending}
              onClick={() => sendCredentials(result.newCredentials)}
            >
              {sending ? "Sending…" : "Send to all"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => downloadCredentialsCsv(result.newCredentials)}
            >
              Download CSV
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
