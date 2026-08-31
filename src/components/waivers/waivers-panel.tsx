"use client";

import type { WaiverDetailRow } from "@/server/dashboards/waivers-view";
import { ActionForm } from "@/components/action-form";
import { TextAreaField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** `"use client"` from the first line — same D-105 reasoning as every
 * other panel in this codebase that renders a per-row `ActionForm`. */
function OutcomeBadge({ outcome }: { outcome: string }) {
  const variant = outcome === "GRANTED" ? "ok" : outcome === "DENIED" ? "danger" : "gold";
  return <Badge variant={variant}>{outcome}</Badge>;
}

export function WaiversPanel({
  waivers,
  canCountersign,
  canApproveFinal,
}: {
  waivers: WaiverDetailRow[];
  canCountersign: boolean;
  canApproveFinal: boolean;
}) {
  return (
    <Card>
      <CardTitle>All waivers</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Permanent visibility (BR-24) — every waiver ever requested, regardless of outcome.
      </p>
      {waivers.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No waiver has ever been requested.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {waivers.map((w) => (
            <li key={w.id} className="rounded border border-deep/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-deep">{w.studentName}</p>
                <OutcomeBadge outcome={w.outcome} />
              </div>
              <p className="mt-1 text-xs text-muted">{w.circumstance}</p>
              {w.hodReason && <p className="mt-1 text-xs text-muted">HoD: {w.hodReason}</p>}

              {canCountersign && w.caseState === "WAIVER_REQUESTED" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ActionForm action={`/api/waivers/${w.id}/countersign`} submitLabel="Counter-sign">
                    <TextAreaField label="Reason" name="reason" required />
                  </ActionForm>
                  <ActionForm
                    action={`/api/waivers/${w.id}/hod-deny`}
                    submitLabel="Deny"
                    variant="secondary"
                    confirmMessage={`Deny ${w.studentName}'s waiver? This ends it — there is no retry (BR-23).`}
                  >
                    <TextAreaField label="Reason" name="reason" required />
                  </ActionForm>
                </div>
              )}

              {canApproveFinal && w.caseState === "WAIVER_COUNTERSIGNED" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ActionForm action={`/api/waivers/${w.id}/approve`} submitLabel="Grant (final)">
                    <TextAreaField label="Reason" name="reason" required />
                  </ActionForm>
                  <ActionForm
                    action={`/api/waivers/${w.id}/dean-deny`}
                    submitLabel="Deny (final)"
                    variant="secondary"
                    confirmMessage={`Deny ${w.studentName}'s waiver? This is final — there is no retry (BR-23).`}
                  >
                    <TextAreaField label="Reason" name="reason" required />
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
