"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MASTER_PROMPT.md §6.1 names TanStack Table for tables/forms; §10:
 * "tables over cards for lists." One generic, sortable table — every
 * M13 list screen (Focal queue, HoD's pending verifications/waivers/
 * restarts) renders through this rather than a bespoke `<table>` each,
 * so sort/empty-state/accessibility behaviour is defined once.
 *
 * Data itself is still fetched server-side (the page is a Server
 * Component) — only the interactive sorting needs "use client."
 */
export function DataTable<T>({
  columns,
  data,
  emptyState,
  initialSorting,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** §10: "Empty states say what to do, not 'no records found.'" */
  emptyState: string;
  initialSorting?: SortingState;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0) {
    return <p className="rounded border border-dashed border-deep/20 p-6 text-sm text-muted">{emptyState}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-deep/10 text-left">
              {headerGroup.headers.map((header) => {
                const sortDirection = header.column.getIsSorted();
                return (
                  <th key={header.id} scope="col" className="px-3 py-2 font-medium text-muted">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mid"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDirection === "asc" && <ArrowUp className="h-3.5 w-3.5" aria-hidden />}
                        {sortDirection === "desc" && <ArrowDown className="h-3.5 w-3.5" aria-hidden />}
                        {!sortDirection && <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr key={row.id} className={cn("border-b border-deep/5", i % 2 === 1 && "bg-tint/50")}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 text-ink">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
