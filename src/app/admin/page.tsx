import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { listStaffUsers } from "@/server/dashboards/admin-view";
import { listSemesters } from "@/server/roster/semesters";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { RosterImportForm } from "@/components/admin/roster-import-form";
import { CreateSemesterForm } from "@/components/admin/create-semester-form";
import { SemestersTable } from "@/components/admin/semesters-table";
import { SweepNowButton } from "@/components/admin/sweep-now-button";
import { CardTitle } from "@/components/ui/card";

/**
 * M15: Admin had no landing page at all (M13's own scope decision,
 * D-082 — "ADMIN-only accounts have no dedicated M13 screen") until
 * this one. Not a `dashboard.view_*` capability (there is no §3 row
 * for "who may load the admin screen," same gap M13 found for the
 * other three roles) — gated by `users.manage` directly, the same
 * capability every route this page calls already requires.
 */
export default async function AdminPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "users.manage");
  } catch {
    redirect("/login");
  }

  const [users, semesters] = await Promise.all([listStaffUsers(), listSemesters()]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-10">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">Admin</p>
        <h1 className="font-serif text-3xl text-deep">Administration</h1>
      </div>

      <section className="flex flex-col gap-4">
        <CardTitle>Staff accounts</CardTitle>
        <CreateUserForm />
        <AdminUsersTable users={users} />
      </section>

      <section className="flex flex-col gap-4">
        <CardTitle>Roster</CardTitle>
        <RosterImportForm />
        <SweepNowButton />
      </section>

      <section className="flex flex-col gap-4">
        <CardTitle>Semesters</CardTitle>
        <CreateSemesterForm />
        <SemestersTable
          semesters={semesters.map((s) => ({
            id: s.id,
            type: s.type,
            year: s.year,
            sequenceNumber: s.sequenceNumber,
            status: s.status,
            documentDeadline: s.documentDeadline ? s.documentDeadline.toISOString().slice(0, 10) : null,
          }))}
        />
      </section>
    </main>
  );
}
