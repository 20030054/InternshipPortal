"use client";

import { ActionForm } from "@/components/action-form";
import { TextAreaField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/grades/:id/reverse` — `src/schemas/grading.ts`'s
 * `reverseGradeSchema`. Additive only (BR-14): the `Grade` row itself
 * is never touched, at the database privilege level, not just by this
 * form's own design — this creates a `GradeReversal` record, it can't
 * edit the original. */
export function ReverseGradeForm({ gradeId }: { gradeId: string }) {
  return (
    <Card>
      <CardTitle>Reverse this grade</CardTitle>
      <p className="mt-1 text-sm text-muted">
        A correction, not an edit — the original grade and this reversal both stay on the
        record, permanently.
      </p>
      <ActionForm
        action={`/api/grades/${gradeId}/reverse`}
        submitLabel="Reverse grade"
        variant="secondary"
        confirmMessage="Reverse this grade? This is permanent and cannot itself be undone."
      >
        <TextAreaField label="Reason" name="reason" required className="mt-3" />
      </ActionForm>
    </Card>
  );
}
