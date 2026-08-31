"use client";

import { ActionForm } from "@/components/action-form";
import { Field, TextAreaField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/restart-request` — `src/schemas/restart.ts`'s
 * `restartRequestSchema`. Always 201s with a real row (BR-16/17): the
 * response itself may already be `DENIED` if G1/G2/G4 rejected it —
 * `RestartRequestsPanel` below shows that outcome once the page
 * refreshes, this form doesn't need to interpret it. */
export function RestartRequestForm({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardTitle>Request a restart</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Must be a genuinely different organisation from the failed attempt (BR-16) — a close
        name match is flagged, not blocked, and needs an HoD override to proceed.
      </p>
      <ActionForm action={`/api/cases/${caseId}/restart-request`} submitLabel="Request restart">
        <div className="mt-3 flex flex-col gap-3">
          <Field label="New company name" name="newCompanyName" type="text" required />
          <Field label="New company contact" name="newCompanyContact" type="text" required />
          <Field
            label="New company registration number (optional)"
            name="newCompanyRegistrationNumber"
            type="text"
          />
          <TextAreaField label="Reason" name="reason" required />
        </div>
      </ActionForm>
    </Card>
  );
}
