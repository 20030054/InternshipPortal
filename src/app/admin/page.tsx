import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { listStaffUsers } from "@/server/dashboards/admin-view";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { AdminUsersTable } from "@/components/admin/admin-users-table";

/**
 * M15: Admin had no landing page at all (M13's own scope decision,
 * D-082 — "ADMIN-only accounts have no dedicated M13 screen") until
 * this one. Not a `dashboard.view_*` capability (there is no §3 row
 * for "who may load the admin screen," same gap M13 found for the
 * other three roles) — gated by `users.manage` directly, the same
 * capability the routes this page calls already require.
 */
export default async function AdminPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "users.manage");
  } catch {
    redirect("/login");
  }

  const users = await listStaffUsers();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">Admin</p>
        <h1 className="font-serif text-3xl text-deep">Staff accounts</h1>
        <p className="mt-1 text-sm text-muted">
          Students are managed via roster import, not here — see docs/RUNBOOK.md §8.
        </p>
      </div>

      <CreateUserForm />
      <AdminUsersTable users={users} />
    </main>
  );
}
