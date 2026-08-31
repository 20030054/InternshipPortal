"use client";

import { ActionForm } from "@/components/action-form";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/recommend-grade` — `src/schemas/grading.ts`'s
 * `recommendGradeSchema` (P/I, reason always required here — BR-14's
 * "no reason needed for CLOSED_PASS" exception applies to the HoD's
 * *award*, not the Focal Person's recommendation). */
export function RecommendGradeForm({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardTitle>Recommend a grade</CardTitle>
      <p className="mt-1 text-sm text-muted">
        The HoD makes the final award — this is a recommendation, not the last word.
      </p>
      <ActionForm action={`/api/cases/${caseId}/recommend-grade`} submitLabel="Recommend grade">
        <div className="mt-3 flex flex-col gap-3">
          <SelectField label="Grade" name="value" required defaultValue="">
            <option value="" disabled>
              Choose a grade
            </option>
            <option value="P">Pass</option>
            <option value="I">Incomplete</option>
          </SelectField>
          <TextAreaField label="Reason" name="reason" required />
        </div>
      </ActionForm>
    </Card>
  );
}
