"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/complete-internship` — `src/schemas/
 * progress.ts`'s `completeInternshipSchema`. Fires row 8
 * (`IN_PROGRESS -> DOCS_PENDING`); BR-08's out-of-bounds-actual-
 * duration flag (if any) is a Focal Person-visible thing, not
 * something this form blocks on. */
export function CompleteInternshipForm({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardTitle>Mark your internship complete</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Record the actual dates you started and finished. This moves your case on to document
        submission.
      </p>
      <ActionForm action={`/api/cases/${caseId}/complete-internship`} submitLabel="Mark complete">
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Field label="Actual start date" name="actualStart" type="date" required />
          <Field label="Actual end date" name="actualEnd" type="date" required />
        </div>
      </ActionForm>
    </Card>
  );
}
