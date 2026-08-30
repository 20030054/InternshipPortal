# Progress

**Current module:** M12 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the full M11 arc — a genesis-inserted `Case` in
`WAIVER_REQUESTED`, a supporting-evidence document stored, HoD
countersignature (outcome stays `PENDING`, case advances to
`WAIVER_COUNTERSIGNED`), Dean's final approval (`WAIVER_GRANTED`, all
three distinct signers recorded on one `Waiver` row), a Dean attempting
to skip the HoD stage correctly rejected, an HoD denial and a Dean
denial each ending the waiver with no retry possible afterward, and a
rejected evidence upload leaving no orphaned `Case` row behind —
exercised directly against the real compose-network database, not just
in tests. `pnpm lint`, `pnpm typecheck`, `pnpm test` [185/185],
`pnpm test:integration` [290/290] all pass, confirmed on two consecutive
freshly-recreated temp Postgres/Redis runs.)

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
- [x] M11 The waiver path
- [ ] M12 Notifications and SLA escalation  <- up next, not started

## Where I stopped
Implemented M11 in full per `/docs/modules/M11.md`: the three-signature
waiver workflow (BR-21 to BR-24). This module resolved OQ-12 (open
since M04) the opposite way from its restrictive default — a waiver
*does* drive real `cases.state` transitions, not an independent
`waivers`-table-only workflow — on concrete evidence found while
building it, not a guess: M01's own `cases_one_nonterminal_per_student`
index already excludes `WAIVER_GRANTED`/`WAIVER_DENIED` from
"non-terminal," M04's own `TERMINAL_CASE_STATES` already listed both as
dead code anticipating real rows, and `Document.caseId` being `NOT NULL`
meant BR-22's "attach supporting documentation" needed a real case to
attach to regardless (D-068).

`initiateWaiver()` (`src/server/waivers/service.ts`) genesis-inserts a
`Case` directly in `WAIVER_REQUESTED` (same pattern as BR-02's sweep and
M10's restart), stores the mandatory supporting-evidence document, then
creates the `Waiver` row. Four new rows joined M04's transition table:
`WAIVER_REQUESTED -> WAIVER_COUNTERSIGNED`/`WAIVER_DENIED` (HOD),
`WAIVER_COUNTERSIGNED -> WAIVER_GRANTED`/`WAIVER_DENIED` (DEAN) — the
Dean only ever reachable from `WAIVER_COUNTERSIGNED`, never directly
from `WAIVER_REQUESTED`, which is what makes all three signatures
mandatory and proves the module's own done-criterion ("a waiver cannot
be granted with two signatures"). Six routes:
`POST /api/students/:id/waiver` (initiate, multipart), `GET /api/waivers`
(BR-24's visibility list, reusing `case.view_any` rather than a new
capability — D-070), and four decision routes
(`countersign`/`hod-deny`/`approve`/`dean-deny`) keyed on the waiver's
own id.

One real bug caught and fixed before it could manifest, same shape as
M09's `awardGrade()` ordering lesson (D-057) and M11's own G1
override-flag design in M10: `Document.caseId` being required means the
`Case` row must exist *before* `storeDocument()` can run, but a failed
upload (bad file type, infected, oversized — routine, not rare) would
otherwise leave that `Case` behind permanently blocking every future
attempt, since `waivers.student_id` is uniquely constrained. Fixed by
deleting the just-created `Case` row on a failed upload before the
error propagates — the one place in this codebase a `Case` row is ever
deleted, safe specifically because it never passed through the
transition executor and nothing else can have referenced it yet (D-069).

## Next action
Write `/docs/modules/M12.md`, then implement email templates for every
status change, BullMQ jobs for reminders, BR-27's Focal Person SLA
escalation (`SLA_DAYS`, default 10 working days — pending approval or
verification escalates to the HoD and flags on the dashboard), BR-28's
supervisor SLA escalation (`SUPERVISOR_SLA_DAYS`, default 14 — two
reminders then flags for Focal Person intervention, already partially
scaffolded by M08's `SupervisorToken.reminderCount`/
`lastReminderSentAt`, unused until now), and an HoD digest email. All
email content templated and versioned — no ad-hoc strings in services.
**Done when** an untouched pending approval escalates on schedule in a
time-travelled test.

## Blocked on
- OQ-13 (graduation boundary semester count) — restrictive default (8)
  applied in M10, inferred only from a seed-data hint; needs a real
  Registrar/HoD answer.
- OQ-09 (does a waiver appear on the transcript differently from a
  pass?) — genuinely open; `WAIVER_GRANTED` stays its own distinct
  terminal `CaseState`, never conflated with `CLOSED_PASS`, precisely so
  this question can still be answered either way without a rewrite.
  Relevant to M13's reporting/transcript story.
- OQ-04 (who holds the Dean role, is there a delegate) — both M10's
  escalation route and M11's final waiver signature already require one
  live `DEAN`-role account with no delegate mechanism.
- OQ-03 (confirm `RESTART_CAP` = 1) — the default is live and enforced
  by G4 as of M10; the number itself is still unconfirmed by the HoD.
- OQ-02 (completion certificate verification standard) — restrictive
  default (any single listed method) applied in M09.
- OQ-07 (document retention period) — doesn't block M11/M12, but the
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
