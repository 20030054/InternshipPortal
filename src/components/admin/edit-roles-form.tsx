"use client";

import { ActionForm } from "@/components/action-form";
import { CheckboxField } from "@/components/ui/field";

/** `POST /api/admin/users/:id/roles` — replace-all, checked boxes are
 * the complete set afterward. "This Focal Person is also the HoD,"
 * "make this account an Admin too" — the gap `setUserRoles()`'s own
 * doc comment explains. */
export function EditRolesForm({
  userId,
  currentRoles,
}: {
  userId: string;
  currentRoles: string[];
}) {
  return (
    <ActionForm action={`/api/admin/users/${userId}/roles`} submitLabel="Save" variant="secondary">
      <div className="flex flex-wrap gap-3">
        {(["FOCAL", "HOD", "DEAN", "ADMIN"] as const).map((role) => (
          <CheckboxField
            key={role}
            label={role}
            name="roles"
            value={role}
            defaultChecked={currentRoles.includes(role)}
          />
        ))}
      </div>
    </ActionForm>
  );
}
