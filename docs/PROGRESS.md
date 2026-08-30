# Progress

**Current module:** M04 — Case lifecycle core
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state including the worker; `pnpm lint`, `pnpm typecheck`,
`pnpm test` [64/64], `pnpm test:integration` [77/77] all pass; worker
confirmed actually consuming the roster-sweep queue in the real
docker-compose stack, not just in the mocked test suite)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [x] M03 Roster, semesters and the eligibility engine
- [ ] M04 Case lifecycle core  <- up next, not started

## Where I stopped
Implemented M03 in full per `/docs/modules/M03.md`: a new migration
(`semesters` gains `sequence_number`/`status`, `cases` gains
`auto_enrolled`, new `roster_imports` table, plus a partial unique index
limiting the whole `semesters` table to at most one `OPEN` row — same
`(true)`-expression-index trick as M01/M02's other "at most one X"
constraints). `computeEligibility()` (BR-01/BR-04) is a pure function,
never a stored column; CSV roster import
(`src/server/roster/csv-import.ts`, OQ-06's restrictive default); the
BR-02 auto-enrollment sweep, which creates a genesis `Case` row directly
in `ELIGIBLE` (a fresh `INSERT`, not a guarded `UPDATE` — no transition
executor needed yet, see OQ-11); 8 new API routes (semester CRUD/open/
close, roster import, sweep-now, eligibility).

The worker stopped being a heartbeat placeholder this module — it's now
a real BullMQ consumer running `worker/index.ts` via `tsx`, registering a
repeatable schedule for the sweep at startup. That required a real
architecture change: `next.config.ts`'s `output: "standalone"` is gone,
and the Dockerfile's runtime stage now copies the builder stage's full
`node_modules` (plus, after a first failed container start caught it,
the raw `src/` tree and `tsconfig.json`) instead of Next's pruned bundle
— the worker runs real TypeScript directly via tsx and needs the actual
source and its dependencies on disk, which Next's file tracer had no way
to know about since it only follows the Next.js app's own import graph.
Documented in DECISIONS.md D-022 and `docs/modules/M03.md` "Why the
Dockerfile changed."

New open question, OQ-11 (not one of the original §12 list): exactly
when is a `Case` auto-created relative to eligibility? Restrictive
reading applied — M03 never auto-creates one for the normal 4-semester
path (that's read as student action, M05's job); only BR-02's explicit
semester-6 fallback creates a case, and it does so directly in ELIGIBLE.
M04 should confirm or correct this once the full transition table exists.

Real bugs found and fixed via full docker-compose verification, not just
unit tests: (1) BullMQ 6.x removed `repeat` from `Queue.add()`'s options
entirely — a TypeScript compile error caught it before runtime, fixed by
switching to `upsertJobScheduler()`. (2) The worker's first container
start failed with `ERR_MODULE_NOT_FOUND` — the Dockerfile copied
`node_modules` but not `src/`, and tsx needs the actual source on disk to
compile on the fly. (3) Several integration tests collided with each
other's leftover state on repeated local runs (an OPEN semester left
behind by one test breaking another's partial-unique-index assumption,
and the old M01 raw-SQL semester fixture missing the new NOT NULL
`sequence_number` column) — all fixed, confirmed clean on a truly fresh
database + Redis, not just "passed once."

## Next action
Write `/docs/modules/M04.md`, then implement: the full state machine
table from `MASTER_PROMPT.md` §5, the transition executor (the only code
path allowed to write `cases.state`, using the `SET LOCAL
app.transition_authorized` mechanism the M01 trigger already enforces),
the guard framework (pure predicate functions per §5.2), and event
emission into `case_events`. No UI. M04 should also weigh in on OQ-11 —
once the real transition table exists, confirm whether M03's restrictive
reading (no case until BR-02's fallback or M05's student action) is
right, or whether every student should get an `ELIGIBILITY_PENDING` case
earlier.

## Blocked on
- OQ-11 (case-creation timing) — restrictive default applied in M03;
  M04 should revisit once the transition table is designed.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered; doesn't block M04.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
