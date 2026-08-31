"use client";

import { ActionForm } from "@/components/action-form";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/cases/:id/award-grade` — `src/schemas/grading.ts`'s
 * `awardGradeSchema`. Deliberately NOT pre-filled from
 * `recommendedGradeValue` and `reason` is not marked HTML-`required` —
 * BR-12: "the Focal Person recommends; the HoD awards" is a real,
 * independent second judgement (D-056), not a rubber stamp, and
 * BR-14's own reason rule differs by outcome (required for Incomplete,
 * not for Pass) — the real route is the one place that distinction is
 * enforced (M09's own schema comment says exactly this). */
export function AwardGradeForm({
  caseId,
  recommendedGradeValue,
}: {
  caseId: string;
  recommendedGradeValue: "P" | "I" | null;
}) {
  return (
    <Card>
      <CardTitle>Award the final grade</CardTitle>
      {recommendedGradeValue && (
        <p className="mt-1 text-sm text-muted">
          The Focal Person recommended{" "}
          <strong className="text-ink">
            {recommendedGradeValue === "P" ? "Pass" : "Incomplete"}
          </strong>
          . Your own judgement decides the actual award.
        </p>
      )}
      <ActionForm action={`/api/cases/${caseId}/award-grade`} submitLabel="Award grade">
        <div className="mt-3 flex flex-col gap-3">
          <SelectField label="Grade" name="value" required defaultValue="">
            <option value="" disabled>
              Choose a grade
            </option>
            <option value="P">Pass</option>
            <option value="I">Incomplete</option>
          </SelectField>
          <TextAreaField label="Reason (required for Incomplete)" name="reason" />
        </div>
      </ActionForm>
    </Card>
  );
}
