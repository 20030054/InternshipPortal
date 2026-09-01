"use client";

import { ActionForm } from "@/components/action-form";
import { CheckboxField } from "@/components/ui/field";

/** D-127: `POST /api/admin/users/:id/departments` — replace-all
 * semantics, checked boxes are the complete set afterward. Only
 * rendered for FOCAL/HOD rows (`AdminUsersTable`) — Dean/Admin stay
 * unscoped, so there's nothing to assign them. */
export function EditDepartmentsForm({
  userId,
  currentDepartments,
}: {
  userId: string;
  currentDepartments: string[];
}) {
  return (
    <ActionForm
      action={`/api/admin/users/${userId}/departments`}
      submitLabel="Save"
      variant="secondary"
    >
      <div className="flex flex-wrap gap-3">
        {(["CS", "SE", "AI", "MBC"] as const).map((dept) => (
          <CheckboxField
            key={dept}
            label={dept}
            name="departments"
            value={dept}
            defaultChecked={currentDepartments.includes(dept)}
          />
        ))}
      </div>
    </ActionForm>
  );
}
