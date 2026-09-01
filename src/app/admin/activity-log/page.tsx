import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { listActivityLog } from "@/server/admin/activity-log";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * "Admin can view each one's activity logs" — a plain server-rendered
 * table (no client-side fetching needed: filtering is just a GET form
 * navigation, the same pattern `searchParams` already handles
 * everywhere else in this codebase, e.g. `/reset-password`). Separate
 * from `/admin` itself, which was already getting crowded with
 * config forms — this is a read-only report, not another thing to
 * configure.
 */
export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ actorEmail?: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "users.manage");
  } catch {
    redirect("/login");
  }

  const { actorEmail } = await searchParams;
  const entries = await listActivityLog({ actorEmail });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/admin" className="text-sm text-mid underline-offset-2 hover:underline">
          ← Admin
        </Link>
        <p className="mt-2 text-sm font-medium tracking-wide text-muted">Admin</p>
        <h1 className="font-serif text-3xl text-deep">Activity log</h1>
        <p className="mt-1 text-sm text-muted">
          Merged from `audit_events` and `case_events` (both append-only, BR-26) — every case
          transition and every other logged action in the system, newest first.
        </p>
      </div>

      <Card>
        <form method="GET" className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-deep">Filter by actor email (optional)</span>
            <input
              type="email"
              name="actorEmail"
              defaultValue={actorEmail ?? ""}
              placeholder="focal@example.scit.test"
              className="rounded border border-muted/40 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mid"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded bg-deep px-4 text-sm font-medium text-white hover:bg-deep/90"
          >
            Filter
          </button>
          {actorEmail && (
            <Link
              href="/admin/activity-log"
              className="text-sm text-mid underline-offset-2 hover:underline"
            >
              Clear
            </Link>
          )}
        </form>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted">
              <th className="py-1 pr-3">When</th>
              <th className="py-1 pr-3">Type</th>
              <th className="py-1 pr-3">Actor</th>
              <th className="py-1">What happened</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  {actorEmail
                    ? `No activity found for ${actorEmail}.`
                    : "No activity recorded yet."}
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={`${entry.kind}-${entry.id}`} className="border-t border-deep/10">
                <td className="py-2 pr-3 whitespace-nowrap text-muted">
                  {entry.createdAt.toLocaleString()}
                </td>
                <td className="py-2 pr-3">
                  <Badge variant={entry.kind === "transition" ? "deep" : "neutral"}>
                    {entry.kind === "transition" ? "Transition" : "Audit"}
                  </Badge>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {entry.actorEmail ?? (entry.systemJob ? `system: ${entry.systemJob}` : "—")}
                </td>
                <td className="py-2">{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
