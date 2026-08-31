import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { getDeanDashboard } from "@/server/dashboards/dean-view";
import { DepartmentDashboard } from "@/components/department-dashboard";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * §7's M13 summary: "Dean read-only view." Same department picture as
 * `/hod` (`DepartmentDashboard`, shared) plus what's specifically
 * awaiting the Dean's own signature. "Read-only" means no action
 * buttons render here — every mutating route this screen's data
 * touches (`waiver.approve_final`, `escalation.rule_restart`) already
 * gates by role independently; nothing here needs to enforce it a
 * second time.
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
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">Dean · read-only</p>
        <h1 className="font-serif text-3xl text-deep">Department view</h1>
      </div>

      {dashboard.awaitingDean.length > 0 && (
        <Card>
          <CardTitle>Awaiting your action</CardTitle>
          <ul className="mt-3 flex flex-col gap-2">
            {dashboard.awaitingDean.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-2 text-sm">
                <Badge variant="gold">{item.kind === "waiver" ? "Waiver" : "Restart denial"}</Badge>
                {item.studentName}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DepartmentDashboard dashboard={dashboard} />
    </main>
  );
}
