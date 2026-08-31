import { redirect } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { getFocalWorkQueue, type FocalQueueRow } from "@/server/dashboards/focal-queue";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

const STATE_LABEL: Record<string, string> = {
  OFFER_UNDER_REVIEW: "Awaiting your approval",
  PENDING_VERIFICATION: "Awaiting your verification",
};

const columns: ColumnDef<FocalQueueRow, unknown>[] = [
  {
    accessorKey: "studentName",
    header: "Student",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.studentName}</p>
        <p className="text-xs text-muted">{row.original.studentEmail}</p>
      </div>
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

/** §10: "The Focal Person's queue is sorted by SLA risk, not by date.
 * The thing about to breach is at the top." */
export default async function FocalQueuePage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "dashboard.view_focal");
  } catch {
    redirect("/login");
  }

  const queue = await getFocalWorkQueue();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">Focal Person</p>
        <h1 className="font-serif text-3xl text-deep">Work queue</h1>
        <p className="mt-1 text-sm text-muted">
          Every case awaiting your review, sorted by how long it&apos;s been waiting.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={queue}
        initialSorting={[{ id: "workingDaysWaiting", desc: true }]}
        emptyState="Nothing is waiting on you right now."
      />
    </main>
  );
}
