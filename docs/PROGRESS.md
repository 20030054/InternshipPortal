# Progress

**Current module:** M05 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with both database and
redis `ok: true`; worker confirmed actually processing a real
roster-sweep job against the compose-network database, not just the
mocked test suite; the M04 executor exercised directly against the same
real database — case created, transitioned, `case_events`/`audit_events`
rows written correctly — inside the running worker container, not just
in tests. `pnpm lint`, `pnpm typecheck`, `pnpm test` [80/80],
`pnpm test:integration` [125/125] all pass on a freshly recreated temp
Postgres/Redis.)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [x] M03 Roster, semesters and the eligibility engine
- [x] M04 Case lifecycle core
- [ ] M05 Offers  <- up next, not started

## Where I stopped
Implemented M04 in full per `/docs/modules/M04.md`: the complete 21-row
transition table (`src/server/state-machine/transitions.ts`) covering
every state change in `MASTER_PROMPT.md` §5 — eligibility confirmation,
offer submission/review/approval/rejection/resubmission, the in-progress/
docs/verification chain, grade recommendation and award (BR-12
recommender-≠-awarder), withdrawal from every pre-APPROVED state, and the
restart sub-flow (request → authorize/deny). `executeTransition()` /
`executeSystemTransition()` (`src/server/state-machine/executor.ts`) are
now the *only* code path that writes `cases.state` — guarded by the
`SET LOCAL app.transition_authorized` mechanism M01's trigger already
enforced, so this is the module that finally exercises that mechanism
for real rather than just having it sit there provably-correct-but-
unused. Every rejection path (illegal transition, wrong actor role,
missing reason, a failing guard) still writes a `TRANSITION_DENIED`
`audit_events` row — a denial is itself an auditable event, not a silent
no-op.

Five guards are real, evaluated against real `TransitionContext` data:
`recommenderNotAwarder` (BR-12), and the four restart guards —
`differentOrganization` (G1, exact normalized-name match only; fuzzy
matching explicitly deferred to M10), `timeRemains` (G2),
`belowRestartCap` (G4/BR-19), `distinctSigners` (G5). Five more
(BR-07/08/09/10/11 — offer completeness, duration, relevance,
deliverables-present, deliverables-verified) are `stubGuard(ruleId)` —
always pass, but carry a `.ruleId` so they're `grep`-able and
traceable, not a silent `return true`. They're stubbed because each
depends on data models that belong to modules not yet built (M05 offers,
M09 documents, M10 company matching); implementing them now would mean
guessing at those modules' shapes. Documented in DECISIONS.md D-027.

While designing the transition table, found and fixed a real gap in
M01's schema: the `cases_one_nonterminal_per_student` partial unique
index didn't list `RESTART_AUTHORIZED` as terminal, which made row 20's
own postcondition (HoD authorizes a restart → a new case gets created in
`ELIGIBLE` for the same student) impossible — the new case's insert
would violate the unique index while the old case still sat in
`RESTART_AUTHORIZED`. Fixed with a new migration
(`20260830120000_restart_authorized_terminal`), proven by
`BR06_restart_authorized_is_terminal.test.ts`. Documented in
DECISIONS.md D-025.

Real bug found and fixed in the test suite itself (not the application
code): `case_events.actor_user_id` and `audit_events.actor_user_id` are
genuine foreign keys to `users.id` — the first draft of M04's integration
tests used arbitrary label strings (`"u1"`, `"hod-1"`, `"same-1"`) as
fake actor ids, which failed at the database with an invalid-UUID error
on every write, including the denial-audit write on every rejection
path (so tests expecting `WrongActorRoleError` etc. got a raw Prisma
error instead of the intended typed error). Fixed with a shared
`tests/integration/support/actor.ts` helper (`createUserActor(...roles)`)
that creates a real `User` row and returns a valid actor; tests whose
guard compares two actor ids for equality (BR-12, G5) capture one
`createUserActor()` result and reuse its `.userId` in both places rather
than creating two separate users.

OQ-11 (case-creation timing) revisited and confirmed as M03 left it: no
change needed. New question, OQ-12: do `WAIVER_*` `CaseState` values
represent real `cases.state` transitions, or is the waiver workflow
entirely independent of any `Case` row? Restrictive reading applied — no
row in the real transition table has a `WAIVER_*` target, proven by
`M04_all_transitions.test.ts`'s last test.

## Next action
Write `/docs/modules/M05.md`, then implement Offers: student submits an
internship offer (the real data behind row 2's `ELIGIBLE ->
OFFER_SUBMITTED` transition and BR-07's stubbed completeness guard),
focal-person review producing the row-4/row-5 approve/reject transitions
for real (replacing the BR-08/BR-09 stubs with real duration/relevance
checks), and the resubmission loop (row 6). M05 is the first module to
actually call `executeTransition()` from a real route handler rather
than from a test — should confirm the capability-based authorization
pattern (`requireCapability()`) composes cleanly with the executor's own
actor-role check, since a route will need both a capability check (can
this identity submit offers at all) and the executor's transition-level
role check (is this identity the right actor for *this* transition).

## Blocked on
- OQ-12 (waiver states vs. case transitions) — restrictive default
  applied in M04 (no transition ever targets a `WAIVER_*` state); M11
  (waivers) should confirm or correct this.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered; doesn't block M04/M05.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
