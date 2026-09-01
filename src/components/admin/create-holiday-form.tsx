"use client";

import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/admin/holidays` (OQ-14, D-121): BR-27's SLA clock skips
 * these dates in addition to Sat/Sun. Fixed civil-calendar dates come
 * pre-seeded; lunar Islamic dates (Eid, etc.) have to be added here
 * each year once actually confirmed, since they can't be computed. */
export function CreateHolidayForm() {
  return (
    <Card>
      <CardTitle>Add a public holiday</CardTitle>
      <ActionForm action="/api/admin/holidays" submitLabel="Add holiday">
        <div className="mt-3 flex gap-3">
          <Field label="Date" name="date" type="date" required />
          <Field label="Name" name="name" type="text" required className="flex-1" />
        </div>
      </ActionForm>
    </Card>
  );
}
