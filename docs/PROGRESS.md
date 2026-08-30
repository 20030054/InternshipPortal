# Progress

**Current module:** M06 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the full M05 arc — open → submit offer → auto under
review → approve → auto in progress — exercised directly against the
real compose-network database inside the running worker container, with
a real file written to and confirmed on the `scit_uploads` volume, not
just in tests. `pnpm lint`, `pnpm typecheck`, `pnpm test` [102/102],
`pnpm test:integration` [155/155] all pass, confirmed on two consecutive
freshly-recreated temp Postgres/Redis runs (checking for flakiness, not
just one green run).)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [x] M03 Roster, semesters and the eligibility engine
- [x] M04 Case lifecycle core
- [x] M05 Offer submission and approval
- [ ] M06 Document vault  <- up next, not started

## Where I stopped
Implemented M05 in full per `/docs/modules/M05.md`: `openCase()`,
`submitOffer()`, `approveOffer()`, `rejectOffer()`
(`src/server/offers/service.ts`) as the first real callers of M04's
executor from actual route handlers. Replaced four of M04's stub guards
with real ones — `eligibilityConfirmed` (BR-01), `offerComplete` (BR-07),
`durationWithinBounds` (BR-08), `relevanceConfirmed` (BR-09) — wired into
rows 1, 2, 4, 6 of the transition table. Five new routes under
`/api/cases`: open (`POST /api/cases`), review queue
(`GET /api/cases`), view (`GET /api/cases/:id`), submit/resubmit offer
(`POST /api/cases/:id/offer`, multipart), approve/reject
(`POST /api/cases/:id/approve` / `/reject`). Two new `cases` columns
(`work_description`, `relevance_confirmed`) plus a `planned_end >
planned_start` sanity CHECK. `src/server/companies/` (find-or-create by
normalised name) and `src/server/documents/store.ts` (a deliberately
minimal interim upload writer — MIME/size checks, SHA-256 checksum, UUID
filename, written outside the web root — explicitly not M06's ClamAV
scan, magic-byte sniffing, or download route, which stay M06's job).

`openCase()` finally gives `ELIGIBILITY_PENDING -> ELIGIBLE` a real
caller (OQ-11): it creates the case, computes eligibility via M03's
`computeEligibility()`, and only proceeds through the real guarded
transition if eligible — no dangling row otherwise. It also blocks
re-opening from any terminal case state except `WITHDRAWN` (a rule
beyond what BR-06's DB index alone enforces — that only blocks a second
*non-terminal* case; without this, a student could route around the
restart gate with a plain re-open). Rows 3 and 7 (`OFFER_SUBMITTED ->
OFFER_UNDER_REVIEW`, `APPROVED -> IN_PROGRESS`, both SYSTEM, no guards)
chain automatically inside `submitOffer()`/`approveOffer()` rather than
waiting on a scheduled sweep — nothing describes a meaningful waiting
state between either pair.

Two real bugs found and fixed via full-suite verification, not just
isolated test runs: (1) a stray local `.env` left over from M04's own
compose verification carried `APP_URL=localhost` (no scheme) and was
being auto-loaded into the Vitest process, breaking
`M02_password_reset_flow.test.ts`'s reset-link regex — unrelated to any
code change, just a leftover local file; removed, and a corrected one
regenerated only for compose verification. (2) M05's own eligible-student
test fixture first picked a large random semester `sequenceNumber`
range specifically to dodge the column's UNIQUE constraint — which
backfired, since `computeEligibility()`'s DB-wide callers (BR02's sweep,
the real eligibility route) count *every* CLOSED semester at or above a
student's admission point, so a high random range silently inflated
BR02_auto_enrollment_sweep's and M03_eligibility_route_ownership's
counts. Fixed by extending the suite's existing "each file owns a low,
disjoint, ordered numeric block" convention one block further down,
documented in DECISIONS.md D-035 alongside a related fix (deriving
semester `year` from `sequenceNumber` instead of a random default, after
hitting one `(type, year)` collision from the added semester volume).
Confirmed the fix by running the full suite twice on freshly recreated
containers, not just once.

## Next action
Write `/docs/modules/M06.md`, then implement the document vault: harden
`src/server/documents/store.ts`'s write path (magic-byte sniffing, a
ClamAV scan against the `clamav` service already in `docker-compose.yml`
but unused until now) and add the read path — an authenticated streaming
download route that checks capability and logs every access, returning
404 on a direct URL guess. Superseded-document handling
(`DocumentStatus.SUPERSEDED`, never deleted) also belongs here. M06
should also wire up `DOCS_PENDING -> PENDING_VERIFICATION`'s stubbed
BR-10 guard (all three deliverables present) once completion-certificate
and supervisor-evaluation documents have somewhere to come from — though
the supervisor evaluation itself is M08's token flow, so BR-10 may stay
partially stubbed until M08 lands too; M06 should record that division
explicitly rather than guessing at M08's shape.

## Blocked on
- OQ-12 (waiver states vs. case transitions) — restrictive default
  applied in M04 (no transition ever targets a `WAIVER_*` state); M11
  (waivers) should confirm or correct this.
- OQ-07 (document retention period) — doesn't block M06 starting, but
  the vault's eventual purge/retention behavior needs a real answer
  before M14's backup/retention story is complete.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered; doesn't block M05/M06.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
