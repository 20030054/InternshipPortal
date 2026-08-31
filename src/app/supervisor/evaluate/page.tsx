import { SupervisorEvaluateForm } from "@/components/public/supervisor-evaluate-form";

/** Public, no session — the real page behind
 * `supervisorTokenEmail()`'s link (M08). See `SupervisorEvaluateForm`'s
 * own doc comment for why this didn't exist until now despite the API
 * being fully built and tested since M08. */
export default async function SupervisorEvaluatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium tracking-wide text-muted">
          School of Computer &amp; Information Technology · BNU
        </p>
        <h1 className="mt-1 font-serif text-2xl text-deep">Internship evaluation</h1>
      </div>

      {token ? (
        <SupervisorEvaluateForm token={token} />
      ) : (
        <p className="text-sm text-danger">
          This page needs the link from your email — the address on its own doesn&apos;t work.
        </p>
      )}
    </main>
  );
}
