# Progress

**Current module:** M11 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the full M10 arc — a same-company restart request
correctly DENIED at the door with a real `RestartRequest` row and Dean
escalation, a flagged (fuzzy) match blocked from countersigning until an
explicit override, the new linked case (ELIGIBLE, `previousCaseId` set,
no company), an explicit HoD denial, a same-account (G5) countersign
rejection that leaves the request PENDING rather than denying it, and
`escalations` confirmed append-only at the privilege level — exercised
directly against the real compose-network database, not just in tests.
`pnpm lint`, `pnpm typecheck`, `pnpm test` [185/185], `pnpm test:integration`
[266/266] all pass, confirmed on two consecutive freshly-recreated temp
Postgres/Redis runs.)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [x] M03 Roster, semesters and the eligibility engine
- [x] M04 Case lifecycle core
- [x] M05 Offer submission and approval
- [x] M06 Document vault
- [x] M07 Progress tracker
- [x] M08 Supervisor evaluation
- [x] M09 Verification and grading
- [x] M10 The restart gate
- [ ] M11 The waiver path  <- up next, not started

## Where I stopped
Implemented M10 in full per `/docs/modules/M10.md`: the workflow around
the four restart guards M04 already built for real (G1 different
organisation, G2 time remains, G4 restart cap, G5 distinct signers).
Five routes (`restart-request`, `restart-requests` list,
`countersign`, `deny`, `escalate`) plus `src/server/restart/service.ts`
— `requestRestart()` always produces a real `RestartRequest` row
(`PENDING` on success, `DENIED` with the failing guard's detail if
G1/G2/G4 rejects it outright), `countersignRestart()` creates the new
linked `Case` (genesis insert, `ELIGIBLE`, `previousCaseId` set) only
*after* the transition itself succeeds — same ordering lesson as M09's
`awardGrade()` — `denyRestart()` and `escalateRestart()` round out
BR-18's denial-then-Dean-ruling path.

G1's fuzzy-match half (explicitly deferred to this module by
`differentOrganization`'s own M04 doc comment) is now real:
`src/server/companies/match.ts` (new, dependency-free
Levenshtein-ratio similarity) plus an exact-registration-number check
added to the guard itself. A flagged (similar-but-not-exact) match
doesn't block the request — it requires the HoD to pass
`acknowledgeFlaggedMatch: true` at countersign time, or the route 400s.
G2 needed a graduation-boundary constant nowhere stated in
`MASTER_PROMPT.md` — `GRADUATION_BOUNDARY_SEMESTERS = 8`
(`src/server/roster/eligibility.ts`), inferred only from §15's seed-data
line ("students across semesters 3 to 8"); logged as OQ-13, not guessed
past silently.

Two real bugs caught and fixed before they became test flakes or
production incidents: BR-20's "the failed case remains
`CLOSED_INCOMPLETE` forever" is about `case_events`' history, not the
live `state` column — M04's own transition table already walks the
failed case to `RESTART_AUTHORIZED`, and a first draft of this module's
own test asserted the literal (wrong) reading (D-063). And a genuine,
previously-invisible test-fixture bug: `computeEligibility()`'s
DB-wide, unbounded "every CLOSED semester at or above admission"
counting had never been exercised in the *upper-bound* direction before
G2 — every prior module only checked a one-directional boolean, immune
to over-counting. M10's tests now reserve a dedicated 41000-41999
block, the one open window between `BR02_auto_enrollment_sweep`'s
ceiling (40_004) and `M03_eligibility_route_ownership`'s floor (50_000)
— see D-064 for the two failed attempts (a low block that got inflated,
a very-high block that inflated M03's own test) before landing there.

Also closed a small, real hardening gap, same shape as M09's fix for
`grade_reversals`: M01 revoked `UPDATE`/`DELETE` on
`audit_events`/`case_events`/`grades` but never `escalations`, despite
`Escalation`'s own doc comment already claiming finality. Fixed in this
module's migration (D-065).

## Next action
Write `/docs/modules/M11.md`, then implement the three-signature waiver
path (BR-21 to BR-24): Focal Person initiates with a mandatory
exceptional-circumstances narrative and evidence, HoD counter-signs,
Dean gives final approval — any one of the three refusing ends it. The
`Waiver` table (M01) is already built and unused, keyed directly to
`student_id`, no `case_id` at all — OQ-12 (open, restrictive default
applied in M04) reads the waiver workflow as entirely independent of
any `Case` row's state, driven only through `waivers.outcome`
(`PENDING`/`GRANTED`/`DENIED`) and its three signature timestamps; M11
should confirm or correct that reading before building the routes. Also
needs the one-per-student constraint (BR-23) and permanent visibility
on the HoD dashboard/annual report (BR-24) — the latter likely just a
read route at this stage, since M13 (reporting) hasn't been built yet.

## Blocked on
- OQ-13 (graduation boundary semester count) — restrictive default (8)
  applied in M10, inferred only from a seed-data hint; needs a real
  Registrar/HoD answer.
- OQ-12 (waiver states vs. case transitions) — restrictive default
  applied in M04; M11 should confirm or correct this now.
- OQ-04 (who holds the Dean role, is there a delegate) — M10's
  escalation route already requires one live `DEAN`-role account with
  no delegate mechanism; M11's final waiver signature needs the same
  answer.
- OQ-03 (confirm `RESTART_CAP` = 1) — the default is live and enforced
  by G4 as of M10; the number itself is still unconfirmed by the HoD.
- OQ-02 (completion certificate verification standard) — restrictive
  default (any single listed method) applied in M09.
- OQ-07 (document retention period) — doesn't block M10/M11, but the
  vault's eventual purge/retention behavior needs a real answer before
  M14's backup/retention story is complete.
- OQ-08 (evaluation visibility to students) — restrictive default
  (hidden) applied in M08, exactly as the master prompt specified.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
