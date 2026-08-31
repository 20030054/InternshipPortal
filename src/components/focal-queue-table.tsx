"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { FocalQueueRow } from "@/server/dashboards/focal-queue";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

/**
 * A real bug found live-verifying M15, not by any test: `columns`
 * (below) holds `cell` *functions* — React Server Components can't
 * serialize a function across the server→client boundary, so having
 * `/focal`'s own Server Component build this array and pass it as a
 * prop into `DataTable` (`"use client"`) crashed on every single
 * request with "Functions cannot be passed directly to Client
 * Components." Extracted here specifically so the columns (and their
 * functions) are constructed *inside* client code, never crossing that
 * boundary — the page itself passes only plain, fully serializable
 * data (`FocalQueueRow[]`: strings, numbers, booleans, dates).
 */
const STATE_LABEL: Record<string, string> = {
  OFFER_UNDER_REVIEW: "Awaiting your approval",
  PENDING_VERIFICATION: "Awaiting your verification",
};

const columns: ColumnDef<FocalQueueRow, unknown>[] = [
  {
    accessorKey: "studentName",
    header: "Student",
    cell: ({ row }) => (
      <Link href={`/cases/${row.original.caseId}`} className="block hover:underline">
        <p className="font-medium text-deep">{row.original.studentName}</p>
        <p className="text-xs text-muted">{row.original.studentEmail}</p>
      </Link>
    ),
  },
  {
    accessorKey: "companyName",
    header: "Company",
    cell: ({ row }) => row.original.companyName ?? <span className="text-muted">—</span>,
  },
  {
    accessorKey: "state",
    header: "Next action",
    cell: ({ row }) => STATE_LABEL[row.original.state] ?? row.original.state,
  },
  {
    accessorKey: "workingDaysWaiting",
    header: "Working days waiting",
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        {Math.floor(row.original.workingDaysWaiting)}
        {row.original.breached && <Badge variant="danger">Overdue</Badge>}
      </span>
    ),
  },
];

export function FocalQueueTable({ queue }: { queue: FocalQueueRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={queue}
      initialSorting={[{ id: "workingDaysWaiting", desc: true }]}
      emptyState="Nothing is waiting on you right now."
    />
  );
}
