# Progress

**Current module:** M13 — up next, not started
**Last session:** 2026-08-31
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the full M12 arc — a real transition (offer approval)
producing a real, templated `Notification` row for the student, the
*same* event independently processed a second time by the live worker
consuming the real Redis queue (two rows ~24ms apart, one from a direct
call, one from the real `case-notifications` worker), BR-27's Focal SLA
sweep escalating a time-travelled breach to every HoD and correctly not
re-escalating on a re-run, BR-28's supervisor reminder sweep sending a
first reminder and bumping `reminderCount`, and the HoD digest reporting
the breach — exercised directly against the real compose-network
database, not just in tests. `pnpm lint`, `pnpm typecheck`, `pnpm test`
[195/195], `pnpm test:integration` [307/307] all pass, confirmed on two
consecutive freshly-recreated temp Postgres/Redis runs.)

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
- [x] M12 Notifications and SLA escalation
- [ ] M13 Dashboards and reporting  <- up next, not started

## Where I stopped
Implemented M12 in full per `/docs/modules/M12.md`. The key
architectural decision: rather than editing six already-shipped service
files to each add their own "send an email" call after their own
`executeTransition()`/`executeSystemTransition()` calls, a single hook
lives at the end of `executeTransition()` itself (M04) — the one code
path every one of M05-M11's transitions already flows through. It
enqueues a `case-notifications` BullMQ job (best-effort, swallowed on
failure, never able to make a legitimate already-committed state change
look like it failed); a worker handler
(`dispatchTransitionNotification()`) looks up a template by the
transition's own `emitsEvent` in a new registry
(`src/server/notifications/templates.ts`, one entry per one of the 20
distinct events the real table produces, including deliberate
`recipients: []` no-ops with their own documented reasoning) and
delivers via the existing `Notification` model (M01, unused until now)
— `QUEUED` → `SENT`/`FAILED`, no automatic retry.

BR-27 (`src/server/sla/focal-sla.ts`/`service.ts`): a working-days
calculator (Sat/Sun only, no BNU holiday calendar — logged as **OQ-14**)
and a sweep escalating any case stuck in `OFFER_UNDER_REVIEW`/
`PENDING_VERIFICATION` past `SLA_DAYS`, deduplicated per *stay* (not per
case, since `OFFER_UNDER_REVIEW` is re-enterable after a rejection/
resubmission cycle). BR-28 (`src/server/sla/service.ts`): pure delivery
on top of M08's already-built detection logic
(`classifyTokenForReminder()`) — a reminder to the supervisor's own
email at each threshold, then a one-time escalation to every FOCAL user.
A digest sweep reports exactly what this module tracks (Focal-SLA
breaches, supervisor escalations) and is skipped entirely on an empty
day — the fuller dashboard picture is explicitly M13's job.

Two real bugs/false starts caught during verification: `case_events`
has been append-only at the privilege level since M01 (`REVOKE UPDATE,
DELETE`, BR-26) — a first draft of this module's own tests tried to
backdate a `CaseEvent.createdAt` directly and failed with a genuine
`permission denied` error. Fixed by having the sweep functions accept
an explicit `now: Date` parameter and passing a travelled value instead
— the correct shape for a "time-travelled test" in the first place, not
a workaround (D-077). And several of this module's own test assertions
initially hardcoded small absolute recipient counts (e.g. "exactly 2
HODs notified"), not accounting for the fact that role-targeted
notifications correctly go to *every* user holding that role across the
whole shared test database — dozens of HOD/FOCAL users accumulated by
other test files, not a bug in the notification system. Fixed by
following `BR02_auto_enrollment_sweep.test.ts`'s own established
precedent: never assert an absolute total against a function with
DB-wide scope, only that *this test's own* fixture is correctly
reflected.

## Next action
Write `/docs/modules/M13.md`, then implement the student case view
(rendered as the eight-step progress line), the Focal Person work queue
(sorted by SLA risk — `runFocalSlaSweep()`'s own breach computation is
already real and reusable here), the HoD department view (counts by
state, overdue eligibility, pending verifications, all waivers, all
restarts — the fuller picture M12's digest deliberately left out), a
Dean read-only view, and XLSX/PDF exports. **Done when** the HoD can
answer "who is at risk of not graduating" in one screen.

## Blocked on
- OQ-14 (BNU holiday calendar / weekend convention for BR-27's working-
  days clock) — restrictive default (Sat-Sun only, no holidays) applied
  in M12.
- OQ-13 (graduation boundary semester count) — restrictive default (8)
  applied in M10, inferred only from a seed-data hint; needs a real
  Registrar/HoD answer.
- OQ-09 (does a waiver appear on the transcript differently from a
  pass?) — genuinely open; relevant to M13's reporting/transcript story.
- OQ-04 (who holds the Dean role, is there a delegate) — both M10's
  escalation route and M11's final waiver signature already require one
  live `DEAN`-role account with no delegate mechanism.
- OQ-03 (confirm `RESTART_CAP` = 1) — the default is live and enforced
  by G4 as of M10; the number itself is still unconfirmed by the HoD.
- OQ-02 (completion certificate verification standard) — restrictive
  default (any single listed method) applied in M09.
- OQ-07 (document retention period) — doesn't block M12/M13, but the
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
