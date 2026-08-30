# Progress

**Current module:** M08 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the full M07 arc — log two weeks, confirm midpoint not
yet reached, log the midpoint week, confirm it flips, reject a duplicate
week, confirm the in-progress overview aggregates correctly, complete the
internship with a longer-than-planned actual duration, confirm the real
`IN_PROGRESS -> DOCS_PENDING` transition fires and the case drops out of
the overview, confirm the computed variance (`hasVariance: true,
varianceWeeks: 2`) — exercised directly against the real compose-network
database, not just in tests. `pnpm lint`, `pnpm typecheck`,
`pnpm test` [139/139], `pnpm test:integration` [194/194] all pass,
confirmed on three consecutive freshly-recreated temp Postgres/Redis
runs.)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [x] M03 Roster, semesters and the eligibility engine
- [x] M04 Case lifecycle core
- [x] M05 Offer submission and approval
- [x] M06 Document vault
- [x] M07 Progress tracker
- [ ] M08 Supervisor evaluation  <- up next, not started

## Where I stopped
Implemented M07 in full per `/docs/modules/M07.md`: a new
`progress_log_entries` table (one row per `(case, week)`, immutable once
written, same append-only default as `case_events`/`audit_events`/
`documents`), `src/server/progress/` (`summary.ts`'s pure
`countWeeksCompleted()`/`hasReachedMidpoint()`, `duration.ts`'s
`weeksBetween()`/`computeDurationVariance()` — the latter factored out
of M05's `durationWithinBounds` guard so both share one implementation,
`service.ts`'s I/O). Four new/changed routes:
`POST`/`GET /api/cases/:id/progress-log`,
`POST /api/cases/:id/complete-internship` (records BR-08's actual dates
and fires the real `IN_PROGRESS -> DOCS_PENDING` transition — row 8's
previously-empty guard list is now `actualDatesRecorded`), and
`GET /api/cases/in-progress-overview` (MASTER_PROMPT.md's "Focal Person
overview of all in-progress internships," pre-joined with each case's
progress summary in one call). `GET /api/cases/:id` (M05) gained a
`durationVariance` field, `null` until both planned and actual dates
exist.

BR-08's duration-variance flag is computed on read, never stored — same
"computed, not self-declared" principle as BR-01's eligibility. The
actual-dates guard deliberately does **not** re-enforce the 4-8-week
bound the way planned dates are enforced at approval — BR-08 says
variance gets flagged, which only makes sense if an out-of-bounds actual
duration is allowed to happen.

Real bugs found and fixed via full-suite verification, not isolated
runs — this session surfaced a structural gap in the whole integration
suite, not just an M07-local issue: **Vitest's default file sequencer
orders by cached test duration, not filename**, which this suite's
shared-database design (`fileParallelism: false`, in place since M01)
had never accounted for. Every semester-range convention this session
and prior ones documented ("BR01 uses 5000s, BR02 uses 10000-40000s,
M03 uses 50000-80000s, low blocks run first") silently assumed
alphabetical execution order — an assumption that turned out false,
confirmed by reproducing `M03_semester_open_close_exclusivity.test.ts`
running *before* `M03_eligibility_route_ownership.test.ts` despite
sorting the other way, corrupting the latter's count. Fixed at the root
with a custom sequencer (`vitest.integration.sequencer.ts`, pinned to
filename order) plus two remaining pollution sources it doesn't cover
(an uncontrolled fixture range in the exclusivity file; a derived-year
offset that turned out to overlap a hand-written range in an older
test). Also widened `createSemesterFixture()`'s default year-collision
space 1000x after a second, unrelated `(type, year)` collision, and
raised a slow ESLint-API unit test's timeout after the growing codebase
pushed it past Vitest's 5-second default. All documented in
DECISIONS.md D-046 through D-048.

Also fixed mid-session: `vitest.integration.sequencer.ts` was first
written under `tests/integration/support/`, which broke the real
`docker compose` build — `.dockerignore` excludes `tests/` entirely, but
`vitest.integration.config.ts` (a root-level file importing it) is still
reachable from Next's own build-time type-check, which failed to
resolve the import inside the Docker build context even though it
resolved fine locally. Moved to the project root, where the config file
that needs it already lives.

## Next action
Write `/docs/modules/M08.md`, then implement supervisor evaluation:
signed, single-use, expiring tokens (`SupervisorToken`, M01 schema
already has the table) tied to one case; a public, no-login form
exposing only student name/company/dates; submission locks the token; a
reminder schedule and the BR-28 non-response escalation (needs BullMQ —
the worker is already a real consumer since M03); Focal Person can
issue a replacement token, audited. M08 is also what finally gives
BR-10's guard (`DOCS_PENDING -> PENDING_VERIFICATION`, still
`stubGuard("BR-10")`) its third leg — deciding how a submitted
supervisor evaluation is represented (a `Document` row, or something
`SupervisorToken`-shaped of its own) is squarely M08's call, not
something M06 should have guessed at.

## Blocked on
- OQ-12 (waiver states vs. case transitions) — restrictive default
  applied in M04; M11 (waivers) should confirm or correct this.
- OQ-07 (document retention period) — doesn't block M07/M08, but the
  vault's eventual purge/retention behavior needs a real answer before
  M14's backup/retention story is complete.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
