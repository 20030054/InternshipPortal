"use client";

import { ActionForm } from "@/components/action-form";
import { Field, TextAreaField, CheckboxField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/approve` / `/reject` — both `offer.approve`
 * (BR-09: relevance confirmation and a reason are mandatory to
 * approve; BR-08 planned dates set here too). Two separate forms, not
 * one with a toggle — approving and rejecting need different fields
 * and neither should be one accidental click away from the other. */
export function OfferReviewForms({ caseId }: { caseId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardTitle>Approve this offer</CardTitle>
        <ActionForm action={`/api/cases/${caseId}/approve`} submitLabel="Approve offer">
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex gap-3">
              <Field label="Planned start" name="plannedStart" type="date" required />
              <Field label="Planned end" name="plannedEnd" type="date" required />
            </div>
            <CheckboxField
              label="I confirm this work is relevant to the student's programme (BR-09)"
              name="relevanceConfirmed"
              required
            />
            <TextAreaField label="Reason" name="reason" required />
          </div>
        </ActionForm>
      </Card>
      <Card>
        <CardTitle>Reject this offer</CardTitle>
        <p className="mt-1 text-sm text-muted">
          Sends the student back to resubmit — not a dead end.
        </p>
        <ActionForm
          action={`/api/cases/${caseId}/reject`}
          submitLabel="Reject offer"
          variant="secondary"
          confirmMessage="Reject this offer? The student will need to resubmit."
        >
          <TextAreaField label="Reason" name="reason" required className="mt-3" />
        </ActionForm>
      </Card>
    </div>
  );
}
