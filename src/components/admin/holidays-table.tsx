"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { ActionForm } from "@/components/action-form";

/** `"use client"` from the first line — same D-105 reasoning as every
 * other table in this codebase with a `cell` function. */
export type HolidayRow = {
  id: string;
  date: string;
  name: string;
};

const columns: ColumnDef<HolidayRow, unknown>[] = [
  { accessorKey: "date", header: "Date" },
  { accessorKey: "name", header: "Name" },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <ActionForm
        action={`/api/admin/holidays/${row.original.id}/remove`}
        submitLabel="Remove"
        variant="secondary"
        confirmMessage={`Remove ${row.original.name} (${row.original.date}) from the holiday calendar?`}
      />
    ),
  },
];

export function HolidaysTable({ holidays }: { holidays: HolidayRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={holidays}
      emptyState="No holidays configured yet — BR-27's SLA clock only skips Sat/Sun until you add some."
    />
  );
}
