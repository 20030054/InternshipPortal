"use client";

import { ActionForm } from "@/components/action-form";
import { Field, CheckboxField } from "@/components/ui/field";
import { Card, CardTitle } from "@/components/ui/card";

/** `POST /api/admin/users` — `src/schemas/users.ts`'s `createUserSchema`
 * (email, roles — at least one of FOCAL/HOD/DEAN/ADMIN, fullName
 * optional). No password field: the new account gets a one-time
 * "set your password" link by email (D-097/`docs/RUNBOOK.md` §6) —
 * there is no temporary password to type in here. `roles` is a set of
 * checkboxes, not a single select, since one account can hold more
 * than one role. */
export function CreateUserForm() {
  return (
    <Card>
      <CardTitle>Create a staff account</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Sends a one-time link to set a password — the same mechanism as &quot;forgot
        password.&quot; If that email doesn&apos;t arrive (e.g. the mail relay is
        briefly unreachable), the account still works — use &quot;Forgot
        password?&quot; on the login page to send a fresh link. Students are
        never created here; see roster import (docs/RUNBOOK.md §8).
      </p>
      <ActionForm action="/api/admin/users" submitLabel="Create account">
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Email" name="email" type="email" required />
          <Field label="Full name (optional)" name="fullName" type="text" />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-deep">
              Roles<span aria-hidden className="text-danger"> *</span>
            </legend>
            <div className="flex flex-wrap gap-4">
              <CheckboxField label="Focal Person" name="roles" value="FOCAL" />
              <CheckboxField label="HoD" name="roles" value="HOD" />
              <CheckboxField label="Dean" name="roles" value="DEAN" />
              <CheckboxField label="Admin" name="roles" value="ADMIN" />
            </div>
          </fieldset>
        </div>
      </ActionForm>
    </Card>
  );
}
