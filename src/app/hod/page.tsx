import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { getHodDashboard } from "@/server/dashboards/hod-view";
import { DepartmentDashboard } from "@/components/department-dashboard";
import { Button } from "@/components/ui/button";

/**
 * §7's M13 summary: "HoD department view: counts by state, overdue
 * eligibility, pending verifications, all waivers, all restarts."
 * Done-criterion: "the HoD can answer 'who is at risk of not
 * graduating' in one screen" — the overdue-eligibility section is that
 * answer.
 */
export default async function HodDashboardPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "dashboard.view_hod");
  } catch {
    redirect("/login");
  }

  const dashboard = await getHodDashboard();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium tracking-wide text-muted">HoD</p>
          <h1 className="font-serif text-3xl text-deep">Department view</h1>
        </div>
        <Button asChild variant="secondary">
          <a href="/api/hod/export">Export to spreadsheet</a>
        </Button>
      </div>

      <DepartmentDashboard dashboard={dashboard} />
    </main>
  );
}
