import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { rolesGrantCapability } from "@/server/authz/matrix";
import { prisma } from "@/server/db/client";
import { getStudentDashboard } from "@/server/dashboards/student-view";
import { ProgressLine } from "@/components/progress-line";
import { Card, CardTitle } from "@/components/ui/card";

/**
 * §10: "The eight-step progress line is the student's entire home
 * page. A student should never wonder what happens next." Only a
 * Student renders here — every other role's home is a dedicated
 * screen, since a queue/dashboard isn't "the same graphic as the
 * departmental poster." Replaces M00's placeholder in full.
 *
 * Every role decision here goes through `rolesGrantCapability()`, not
 * a raw `identity.roles.includes(...)` check — matrix.ts's own rule:
 * "nothing else in the codebase is allowed to branch on a role name
 * directly" (D-004), which applies to navigation, not just mutations.
 */
export default async function Home() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");

  if (rolesGrantCapability(identity.roles, "dashboard.view_focal")) redirect("/focal");
  if (rolesGrantCapability(identity.roles, "dashboard.view_hod")) redirect("/hod");
  if (rolesGrantCapability(identity.roles, "dashboard.view_dean")) redirect("/dean");
  if (!rolesGrantCapability(identity.roles, "dashboard.view_student")) {
    // ADMIN-only accounts have no dedicated M13 screen — see
    // docs/modules/M13.md "Scope decisions."
    redirect("/login");
  }

  const student = await prisma.student.findUnique({
    where: { userId: identity.userId },
    select: { id: true },
  });
  if (!student) redirect("/login");

  const dashboard = await getStudentDashboard(student.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">
          School of Computer &amp; Information Technology · BNU
        </p>
        <h1 className="font-serif text-3xl text-deep">Your internship</h1>
      </div>

      {dashboard.status === "no_case" ? (
        <Card>
          <CardTitle>
            {dashboard.isEligible ? "You're eligible to begin" : "Not yet eligible"}
          </CardTitle>
          <p className="mt-2 text-sm text-ink">
            {dashboard.isEligible
              ? "You've completed enough semesters for the internship course. Secure an offer and submit your offer letter to open a case."
              : "You'll become eligible for the internship course once you've completed enough semesters. Nothing to do yet."}
          </p>
        </Card>
      ) : (
        <Card>
          <CardTitle>{dashboard.companyName ?? "Internship"}</CardTitle>
          <div className="mt-4">
            <ProgressLine progress={dashboard.progress} />
          </div>
        </Card>
      )}
    </main>
  );
}
