import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/auth/current-identity";
import { requireCapability } from "@/server/authz/require-capability";
import { getFocalWorkQueue } from "@/server/dashboards/focal-queue";
import { FocalQueueTable } from "@/components/focal-queue-table";

/** §10: "The Focal Person's queue is sorted by SLA risk, not by date.
 * The thing about to breach is at the top." Table rendering itself
 * lives in `FocalQueueTable` ("use client") — see that file's own
 * comment for why. */
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

      <FocalQueueTable queue={queue} />
    </main>
  );
}
