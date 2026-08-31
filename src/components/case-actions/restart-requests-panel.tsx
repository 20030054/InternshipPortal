"use client";

import type { CaseDetailRestartRequest } from "@/server/cases/detail";
import { ActionForm } from "@/components/action-form";
import { TextAreaField, CheckboxField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * `"use client"` from the first line — same reasoning as
 * `AdminUsersTable`/`FocalQueueTable` (D-105): this renders one
 * `ActionForm` per row depending on the viewer's role and the row's
 * own state, which only ever works safely built client-side.
 */
function OutcomeBadge({ outcome }: { outcome: string }) {
  const variant = outcome === "AUTHORIZED" ? "ok" : outcome === "DENIED" ? "danger" : "gold";
  return <Badge variant={variant}>{outcome}</Badge>;
}

export function RestartRequestsPanel({
  requests,
  canCountersign,
  canEscalate,
}: {
  requests: CaseDetailRestartRequest[];
  canCountersign: boolean;
  canEscalate: boolean;
}) {
  if (requests.length === 0) return null;

  return (
    <Card>
      <CardTitle>Restart requests</CardTitle>
      <ul className="mt-3 flex flex-col gap-4">
        {requests.map((r) => (
          <li key={r.id} className="rounded border border-deep/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-deep">{r.newCompanyName}</p>
              <OutcomeBadge outcome={r.outcome} />
            </div>
            <p className="mt-1 text-xs text-muted">Focal reason: {r.focalReason}</p>
            {r.hodReason && <p className="mt-1 text-xs text-muted">HoD reason: {r.hodReason}</p>}
            {r.g1Flagged && (
              <p className="mt-1 text-xs text-gold">
                Company name flagged as a possible match to the failed attempt (BR-16/17) —
                counter-signing this needs the override below.
              </p>
            )}

            {canCountersign && r.outcome === "PENDING" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ActionForm
                  action={`/api/restart-requests/${r.id}/countersign`}
                  submitLabel="Counter-sign"
                >
                  <div className="flex flex-col gap-2">
                    {r.g1Flagged && (
                      <CheckboxField
                        label="I've reviewed the flagged company match and confirm it's genuinely different"
                        name="acknowledgeFlaggedMatch"
                      />
                    )}
                    <TextAreaField label="Reason" name="reason" required />
                  </div>
                </ActionForm>
                <ActionForm
                  action={`/api/restart-requests/${r.id}/deny`}
                  submitLabel="Deny"
                  variant="secondary"
                  confirmMessage="Deny this restart request? It opens a Dean escalation — there is no resubmission on the same facts."
                >
                  <TextAreaField label="Reason" name="reason" required />
                </ActionForm>
              </div>
            )}

            {canEscalate && r.outcome === "DENIED" && !r.alreadyEscalated && (
              <div className="mt-3">
                <ActionForm
                  action={`/api/restart-requests/${r.id}/escalate`}
                  submitLabel="Record final ruling"
                >
                  <div className="flex flex-col gap-2">
                    <TextAreaField label="Reason" name="reason" required />
                    <TextAreaField label="Ruling" name="ruling" required />
                  </div>
                </ActionForm>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
