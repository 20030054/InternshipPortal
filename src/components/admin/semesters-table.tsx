"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/action-form";

/** `"use client"` from the first line — same D-105 reasoning as every
 * other table in this codebase with a `cell` function. Plain
 * serializable data in (`SemesterRow[]`), never a `columns` array
 * built in the server component that renders this. */
export type SemesterRow = {
  id: string;
  type: string;
  year: number;
  sequenceNumber: number;
  status: "UPCOMING" | "OPEN" | "CLOSED";
  documentDeadline: string | null;
};

const columns: ColumnDef<SemesterRow, unknown>[] = [
  {
    accessorKey: "sequenceNumber",
    header: "#",
  },
  {
    accessorKey: "type",
    header: "Semester",
    cell: ({ row }) => `${row.original.type} ${row.original.year}`,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const variant =
        row.original.status === "OPEN" ? "ok" : row.original.status === "CLOSED" ? "neutral" : "gold";
      return <Badge variant={variant}>{row.original.status}</Badge>;
    },
  },
  {
    accessorKey: "documentDeadline",
    header: "Document deadline",
    cell: ({ row }) => row.original.documentDeadline ?? <span className="text-muted">not set (BR-05)</span>,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) =>
      row.original.status === "OPEN" ? (
        <ActionForm
          action={`/api/admin/semesters/${row.original.id}/close`}
          submitLabel="Close"
          variant="secondary"
        />
      ) : (
        <ActionForm
          action={`/api/admin/semesters/${row.original.id}/open`}
          submitLabel="Open"
          confirmMessage={`Open ${row.original.type} ${row.original.year}? This automatically closes whichever semester is currently open.`}
        />
      ),
  },
];

export function SemestersTable({ semesters }: { semesters: SemesterRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={semesters}
      emptyState="No semesters yet — create the first one above."
    />
  );
}
