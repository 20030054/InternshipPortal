"use client";

import { ActionForm } from "@/components/action-form";
import { Field, TextAreaField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/offer` — `src/schemas/offers.ts`'s
 * `submitOfferSchema` (companyName/companyContact/workDescription,
 * >=200 chars) plus the `offerLetter` file the schema's own comment
 * says arrives via FormData, not the Zod body. */
export function SubmitOfferForm({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardTitle>Submit your offer letter</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Secured an offer? Enter the company details and upload the offer letter (PDF, JPEG or
        PNG).
      </p>
      <ActionForm
        action={`/api/cases/${caseId}/offer`}
        encoding="multipart"
        submitLabel="Submit offer"
      >
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Company name" name="companyName" type="text" required />
          <Field label="Company contact" name="companyContact" type="text" required />
          <TextAreaField
            label="Description of the work (at least 200 characters)"
            name="workDescription"
            minLength={200}
            required
          />
          <Field
            label="Offer letter file (PDF, JPEG or PNG)"
            name="offerLetter"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
          />
        </div>
      </ActionForm>
    </Card>
  );
}
