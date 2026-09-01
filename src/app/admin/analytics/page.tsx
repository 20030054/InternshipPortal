import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { getAdminAnalytics } from "@/server/admin/analytics";
import { Card, CardTitle } from "@/components/ui/card";

/** A simple CSS-width bar — no charting dependency added for this,
 * matching this codebase's general "only add a real dependency when
 * hand-rolling genuinely isn't reasonable" stance (contrast
 * `archiver`, D-123, where hand-rolling ZIP really wasn't). */
function Bar({ label, value, max, colorClass }: { label: string; value: number; max: number; colorClass: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 text-ink">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-tint">
        <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-muted">{value}</span>
    </div>
  );
}

/**
 * "Complete reporting and analytics... view live current progress
 * through visuals" — computed fresh on every load
 * (`getAdminAnalytics()`'s own doc comment), never a stored snapshot.
 * Separate page from `/admin` itself, same reasoning as
 * `/admin/activity-log`: a read-only report, not another config form.
 */
export default async function AdminAnalyticsPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "users.manage");
  } catch {
    redirect("/login");
  }

  const analytics = await getAdminAnalytics();
  const maxStateCount = Math.max(1, ...analytics.countsByState.map((s) => s.count));
  const maxSla = Math.max(1, analytics.slaCompliance.withinSla, analytics.slaCompliance.breached);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/admin" className="text-sm text-mid underline-offset-2 hover:underline">
          ← Admin
        </Link>
        <p className="mt-2 text-sm font-medium tracking-wide text-muted">Admin</p>
        <h1 className="font-serif text-3xl text-deep">Analytics</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase text-muted">Total students</p>
          <p className="mt-1 font-serif text-2xl text-deep">{analytics.roster.totalStudents}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted">Cases opened (all time)</p>
          <p className="mt-1 font-serif text-2xl text-deep">{analytics.roster.totalCasesOpened}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-muted">Current semester</p>
          <p className="mt-1 font-serif text-2xl text-deep">
            {analytics.roster.currentSemesterType
              ? `${analytics.roster.currentSemesterType} ${analytics.roster.currentSemesterYear}`
              : "None open"}
          </p>
        </Card>
      </div>

      <Card>
        <CardTitle>Case funnel — count by state</CardTitle>
        <div className="mt-4 flex flex-col gap-2">
          {analytics.countsByState.length === 0 ? (
            <p className="text-sm text-muted">No cases exist yet.</p>
          ) : (
            analytics.countsByState.map((row) => (
              <Bar
                key={row.state}
                label={row.state}
                value={row.count}
                max={maxStateCount}
                colorClass="bg-deep"
              />
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>BR-27 SLA compliance (Focal-pending cases)</CardTitle>
        <p className="mt-1 text-sm text-muted">
          {analytics.slaCompliance.pending} case(s) currently awaiting Focal action.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Bar
            label="Within SLA"
            value={analytics.slaCompliance.withinSla}
            max={maxSla}
            colorClass="bg-ok"
          />
          <Bar
            label="Breached"
            value={analytics.slaCompliance.breached}
            max={maxSla}
            colorClass="bg-danger"
          />
        </div>
      </Card>

      <a
        href="/api/admin/analytics/export"
        className="inline-flex w-fit items-center rounded border border-deep/20 bg-white px-4 py-2 text-sm font-medium text-deep hover:bg-tint"
      >
        Download full report (XLSX) →
      </a>
    </main>
  );
}
