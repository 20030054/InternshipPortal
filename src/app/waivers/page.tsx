import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { rolesGrantCapability } from "@/server/authz/matrix";
import { listWaiverDetails } from "@/server/dashboards/waivers-view";
import { InitiateWaiverForm } from "@/components/waivers/initiate-waiver-form";
import { WaiversPanel } from "@/components/waivers/waivers-panel";

/**
 * M15: the waiver path (§1.2's second exception path). Gated by
 * `case.view_any` (FOCAL/HOD/DEAN, matching `GET /api/waivers`'s own
 * capability, BR-24's "staff-only" visibility) — Admin and Student
 * never see this page.
 */
export default async function WaiversPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/login");
  try {
    requireCapability(identity, "case.view_any");
  } catch {
    redirect("/login");
  }

  const waivers = await listWaiverDetails();
  const canInitiate = rolesGrantCapability(identity.roles, "waiver.initiate");
  const canCountersign = rolesGrantCapability(identity.roles, "waiver.countersign");
  const canApproveFinal = rolesGrantCapability(identity.roles, "waiver.approve_final");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">Waivers</p>
        <h1 className="font-serif text-3xl text-deep">The waiver path</h1>
        <p className="mt-1 text-sm text-muted">
          Skips the normal eight steps entirely, for a genuinely exceptional circumstance.
        </p>
      </div>

      {canInitiate && <InitiateWaiverForm />}
      <WaiversPanel waivers={waivers} canCountersign={canCountersign} canApproveFinal={canApproveFinal} />
    </main>
  );
}
