import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { getDeanDashboard } from "@/server/dashboards/dean-view";
import { DepartmentDashboard } from "@/components/department-dashboard";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WaiversNavLink } from "@/components/staff-nav";

/**
 * §7's M13 summary: "Dean read-only view." Same department picture as
 * `/hod` (`DepartmentDashboard`, shared) plus what's specifically
 * awaiting the Dean's own signature. This screen itself stays
 * read-only by design — M15 added the real actions (grade reversal
 * and restart escalation on `/cases/:id`, waiver approval on
 * `/waivers`) on the pages the "awaiting your action" items below now
 * link to, rather than cluttering this summary view with them
 * directly; every one of those routes already gates by role
 * independently regardless of which screen links to it.
 */
export default async function DeanDashboardPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "dashboard.view_dean");
  } catch {
    redirect("/login");
  }

  const dashboard = await getDeanDashboard();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium tracking-wide text-muted">Dean</p>
          <h1 className="font-serif text-3xl text-deep">Department view</h1>
        </div>
        <WaiversNavLink />
      </div>

      {dashboard.awaitingDean.length > 0 && (
        <Card>
          <CardTitle>Awaiting your action</CardTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {dashboard.awaitingDean.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-2 text-sm">
                <Badge variant="gold">{item.kind === "waiver" ? "Waiver" : "Restart denial"}</Badge>
                {item.caseId ? (
                  <Link href={`/cases/${item.caseId}`} className="text-mid hover:underline">
                    {item.studentName}
                  </Link>
                ) : (
                  <Link href="/waivers" className="text-mid hover:underline">
                    {item.studentName}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DepartmentDashboard dashboard={dashboard} />
    </main>
  );
}
