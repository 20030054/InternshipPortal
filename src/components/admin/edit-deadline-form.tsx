"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";

/** OQ-01, answered: the deadline set when a semester is created isn't
 * final — this is the "change it later" half of that answer,
 * `POST /api/admin/semesters/:id/deadline`. An empty date clears the
 * deadline back to unset (BR-05's sweep stays dormant), same as
 * leaving it blank at creation does. */
export function EditDeadlineForm({
  semesterId,
  currentDeadline,
}: {
  semesterId: string;
  currentDeadline: string | null;
}) {
  return (
    <ActionForm
      action={`/api/admin/semesters/${semesterId}/deadline`}
      submitLabel="Save"
      variant="secondary"
    >
      <Field
        label="Document deadline"
        name="documentDeadline"
        type="date"
        defaultValue={currentDeadline ?? ""}
      />
    </ActionForm>
  );
}
