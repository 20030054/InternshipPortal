"use client";

import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/admin/semesters` — `src/schemas/roster.ts`'s
 * `createSemesterSchema`. `sequenceNumber` left blank defaults to
 * "next after the current max" server-side (D-019: an explicit,
 * human-assigned order, never inferred from `type`/`year`) —
 * `documentDeadline` left blank means BR-05's sweep (M14) stays
 * dormant for this semester until it's actually set. */
export function CreateSemesterForm() {
  return (
    <Card>
      <CardTitle>Create a semester</CardTitle>
      <ActionForm action="/api/admin/semesters" submitLabel="Create semester">
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex gap-3">
            <SelectField label="Type" name="type" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              <option value="FALL">Fall</option>
              <option value="SPRING">Spring</option>
              <option value="SUMMER">Summer</option>
            </SelectField>
            <Field label="Year" name="year" type="number" required />
          </div>
          <div className="flex gap-3">
            <Field label="Starts on" name="startsOn" type="date" required />
            <Field label="Ends on" name="endsOn" type="date" required />
          </div>
          <Field
            label="Document submission deadline (optional — BR-05)"
            name="documentDeadline"
            type="date"
          />
          <Field
            label="Sequence number (optional — defaults to next)"
            name="sequenceNumber"
            type="number"
          />
        </div>
      </ActionForm>
    </Card>
  );
}
