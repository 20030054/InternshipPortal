"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { AdminUserRow } from "@/server/dashboards/admin-view";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/action-form";

/**
 * `"use client"` from the very first line, deliberately — this table's
 * `columns` hold `cell` functions, and D-105 (docs/DECISIONS.md) is
 * exactly what happens when a Server Component builds that array and
 * hands it to `DataTable` as a prop instead. `AdminPage` (the server
 * component) passes only plain data (`AdminUserRow[]`) in.
 */
const columns: ColumnDef<AdminUserRow, unknown>[] = [
  {
    accessorKey: "email",
    header: "Account",
    cell: ({ row }) => (
      <div>
        <p className="font-medium text-deep">{row.original.fullName ?? row.original.email}</p>
        <p className="text-xs text-muted">{row.original.email}</p>
      </div>
    ),
  },
  {
    accessorKey: "roles",
    header: "Roles",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.roles.map((role) => (
          <Badge key={role} variant="deep">
            {role}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: "disabledAt",
    header: "Status",
    cell: ({ row }) =>
      row.original.disabledAt ? (
        <Badge variant="danger">Deactivated</Badge>
      ) : (
        <Badge variant="ok">Active</Badge>
      ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) =>
      row.original.disabledAt ? (
        <ActionForm
          action={`/api/admin/users/${row.original.id}/reactivate`}
          submitLabel="Reactivate"
          confirmMessage={`Reactivate ${row.original.email}? They'll be able to sign in again.`}
        />
      ) : (
        <ActionForm
          action={`/api/admin/users/${row.original.id}/deactivate`}
          submitLabel="Deactivate"
          variant="secondary"
          confirmMessage={`Deactivate ${row.original.email}? They'll be signed out immediately and can't log back in.`}
        />
      ),
  },
];

export function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={users}
      emptyState="No staff accounts yet — create the first one above."
    />
  );
}
