"use client";

import { ActionForm } from "@/components/action-form";

/** `POST /api/cases/:id/mark-verified` — no body. Fires row 10
 * (`PENDING_VERIFICATION -> VERIFIED`); the real guard
 * (`deliverablesVerified`) rejects with the specific missing
 * deliverables (422, `{reasons: [...]}`) if called too early —
 * `ActionForm` already surfaces that as the shown error. */
export function MarkVerifiedButton({ caseId }: { caseId: string }) {
  return <ActionForm action={`/api/cases/${caseId}/mark-verified`} submitLabel="Mark case fully verified" />;
}
