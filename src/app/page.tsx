// Placeholder home page for M00. Proves the container, Next.js and Tailwind
// are wired together end to end. Replaced entirely by M13's real student
// home page (the live eight-step progress line), per
// /docs/modules/M00.md "Screens".
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-tint px-6 text-center">
      <p className="mb-2 text-sm font-medium tracking-wide text-muted">
        School of Computer &amp; Information Technology · BNU
      </p>
      <h1 className="font-serif text-3xl text-deep sm:text-4xl">
        SCIT Internship Portal
      </h1>
      <p className="mt-4 max-w-md text-base text-muted">
        Under construction. This placeholder confirms the container, Next.js
        and Tailwind are wired up — the real home page arrives with M13.
      </p>
    </main>
  );
}
