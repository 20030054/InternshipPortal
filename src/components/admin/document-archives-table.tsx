"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/action-form";

/** `"use client"` from the first line — same D-105 reasoning as every
 * other table in this codebase with a `cell` function. */
export type DocumentArchiveRow = {
  id: string;
  year: number;
  documentCount: number;
  confirmedAt: string | null;
  createdAt: string;
};

const columns: ColumnDef<DocumentArchiveRow, unknown>[] = [
  { accessorKey: "year", header: "Year" },
  { accessorKey: "documentCount", header: "Documents" },
  { accessorKey: "createdAt", header: "Created" },
  {
    accessorKey: "confirmedAt",
    header: "Status",
    cell: ({ row }) =>
      row.original.confirmedAt ? (
        <Badge variant="neutral">Purged {row.original.confirmedAt}</Badge>
      ) : (
        <Badge variant="gold">Awaiting confirmation</Badge>
      ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex gap-2">
        <a
          href={`/api/admin/documents/archive/${row.original.id}/download`}
          className="inline-flex items-center rounded border border-deep/20 bg-white px-3 py-1.5 text-sm font-medium text-deep hover:bg-tint"
        >
          Download
        </a>
        {!row.original.confirmedAt && (
          <ActionForm
            action={`/api/admin/documents/archive/${row.original.id}/confirm-purge`}
            submitLabel="Confirm downloaded — delete files"
            variant="secondary"
            confirmMessage={`Delete the ${row.original.documentCount} file(s) in this archive from disk? Only do this once you've actually downloaded and saved the zip — this can't be undone. The document records themselves are kept forever either way.`}
          />
        )}
      </div>
    ),
  },
];

export function DocumentArchivesTable({ archives }: { archives: DocumentArchiveRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={archives}
      emptyState="No archives created yet."
    />
  );
}
