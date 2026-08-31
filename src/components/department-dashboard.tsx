"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  HodDashboard,
  OverdueEligibilityRow,
  PendingVerificationRow,
  WaiverRow,
  RestartRow,
} from "@/server/dashboards/hod-view";
import type { DeadlineMissedRow } from "@/server/roster/deadline-sweep";
import { DataTable } from "@/components/data-table";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const overdueColumns: ColumnDef<OverdueEligibilityRow, unknown>[] = [
  { accessorKey: "studentName", header: "Student" },
  { accessorKey: "studentEmail", header: "Email" },
  { accessorKey: "semestersCompleted", header: "Semesters completed" },
];

const pendingVerificationColumns: ColumnDef<PendingVerificationRow, unknown>[] = [
  {
    accessorKey: "studentName",
    header: "Student",
    cell: ({ row }) => (
      <Link href={`/cases/${row.original.caseId}`} className="font-medium text-deep hover:underline">
        {row.original.studentName}
      </Link>
    ),
  },
  {
    accessorKey: "companyName",
    header: "Company",
    cell: ({ row }) => row.original.companyName ?? <span className="text-muted">—</span>,
  },
];

function OutcomeBadge({ outcome }: { outcome: string }) {
  const variant = outcome === "GRANTED" || outcome === "AUTHORIZED" ? "ok" : outcome === "DENIED" ? "danger" : "gold";
  return <Badge variant={variant}>{outcome.charAt(0) + outcome.slice(1).toLowerCase()}</Badge>;
}

const waiverColumns: ColumnDef<WaiverRow, unknown>[] = [
  { accessorKey: "studentName", header: "Student" },
  { accessorKey: "outcome", header: "Outcome", cell: ({ row }) => <OutcomeBadge outcome={row.original.outcome} /> },
  {
    accessorKey: "createdAt",
    header: "Requested",
    cell: ({ row }) => row.original.createdAt.toLocaleDateString(),
  },
];

const deadlineMissedColumns: ColumnDef<DeadlineMissedRow, unknown>[] = [
  { accessorKey: "studentName", header: "Student" },
];

const restartColumns: ColumnDef<RestartRow, unknown>[] = [
  { accessorKey: "studentName", header: "Student" },
  { accessorKey: "outcome", header: "Outcome", cell: ({ row }) => <OutcomeBadge outcome={row.original.outcome} /> },
  {
    accessorKey: "createdAt",
    header: "Requested",
    cell: ({ row }) => row.original.createdAt.toLocaleDateString(),
  },
];

/** Shared by `/hod` and `/dean` — §7's M13 summary describes the same
 * department picture for both, the Dean's screen adding only "what's
 * specifically awaiting the Dean" on top (rendered by the caller, not
 * this component, since only `/dean` has that section). */
export function DepartmentDashboard({ dashboard }: { dashboard: HodDashboard }) {
  return (
    <>
      <section>
        <h2 className="mb-3 font-serif text-lg text-deep">Counts by state</h2>
        <div className="flex flex-wrap gap-3">
          {dashboard.countsByState.map((row) => (
            <Card key={row.state} className="min-w-[10rem] flex-1 p-4">
              <p className="text-2xl font-semibold text-deep">{row.count}</p>
              <p className="text-xs text-muted">{row.state.replaceAll("_", " ").toLowerCase()}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <CardTitle className="mb-3">Overdue eligibility — at risk of not graduating</CardTitle>
        <DataTable
          columns={overdueColumns}
          data={dashboard.overdueEligibility}
          emptyState="No eligible student is without a case right now."
        />
      </section>

      <section>
        <CardTitle className="mb-3">Pending verifications</CardTitle>
        <DataTable
          columns={pendingVerificationColumns}
          data={dashboard.pendingVerifications}
          emptyState="Nothing is awaiting verification right now."
        />
      </section>

      <section>
        <CardTitle className="mb-3">Deadline missed — flagged, not auto-failed (BR-05)</CardTitle>
        <DataTable
          columns={deadlineMissedColumns}
          data={dashboard.deadlineMissed}
          emptyState="No case has missed the current semester's document deadline."
        />
      </section>

      <section>
        <CardTitle className="mb-3">Waivers</CardTitle>
        <DataTable columns={waiverColumns} data={dashboard.waivers} emptyState="No waiver has ever been requested." />
      </section>

      <section>
        <CardTitle className="mb-3">Restarts</CardTitle>
        <DataTable
          columns={restartColumns}
          data={dashboard.restarts}
          emptyState="No restart has ever been requested."
        />
      </section>
    </>
  );
}
