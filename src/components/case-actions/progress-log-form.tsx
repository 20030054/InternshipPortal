"use client";

import { ActionForm } from "@/components/action-form";
import { Field, TextAreaField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/progress-log` — `src/schemas/progress.ts`'s
 * `addProgressLogEntrySchema` (weekNumber >= 1, note). One row per
 * `(case, week)`, immutable once logged (D-043) — this form only ever
 * adds a new entry, never edits one. */
export function ProgressLogForm({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardTitle>Log this week&apos;s progress</CardTitle>
      <ActionForm action={`/api/cases/${caseId}/progress-log`} submitLabel="Log entry">
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Week number" name="weekNumber" type="number" min={1} required />
          <TextAreaField label="What did you work on this week?" name="note" required />
        </div>
      </ActionForm>
    </Card>
  );
}
