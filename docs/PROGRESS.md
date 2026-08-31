# Progress

**Current module:** M14 — up next, not started
**Last session:** 2026-08-31
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; `/login` and `/` (redirecting unauthenticated visitors)
both confirmed rendering over real HTTP through Caddy; the full M13 arc —
a student's progress line correctly at step 4 then moving live to step 5
the instant a real offer approval transitions the case, the Focal queue
correctly listing and SLA-sorting a pending case, the HoD view's counts/
overdue-eligibility/waivers/restarts all populated from real data, the
Dean view carrying the same data read-only, a real `@react-pdf/renderer`
PDF with correct magic bytes, and a real `exceljs` workbook with all five
expected sheets — exercised directly against the real compose-network
database, not just in tests. `pnpm lint`, `pnpm typecheck`, `next build`,
`pnpm test` [224/224], `pnpm test:integration` [334/334] all pass,
confirmed on two consecutive freshly-recreated temp Postgres/Redis runs.)

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
- [x] M13 Dashboards and reporting
- [ ] M14 Hardening, backup and handover  <- up next, not started

## Where I stopped
Implemented M13 in full per `/docs/modules/M13.md` — the first UI
module. Every prior module shipped an API surface with no screen behind
it; M00's placeholder home page and M02's deliberately unstyled login
page both said so explicitly ("replaced entirely by M13"). Built on
M00's already-scaffolded design system (`tailwind.config.ts`'s §10
palette, `globals.css`, `components.json`'s shadcn conventions, never
exercised until now): four screens (`/` role-dispatching to the
student's own progress line or redirecting staff to their own screen,
`/focal`, `/hod`, `/dean`), hand-written `Button`/`Badge`/`Card`
primitives against `components.json`'s own conventions rather than the
shadcn CLI, a shared `DataTable` (TanStack Table v8 — pinned below the
newly-released, still-undocumented v9 — see D-079), a case-summary PDF
(`@react-pdf/renderer`) and an HoD department XLSX export (`exceljs`,
§6.1 names no XLSX library — D-080).

Four new capabilities (`dashboard.view_student`/`_focal`/`_hod`/`_dean`,
D-082) gate the four screens — §3's eighteen rows are all about
mutations, none of them answer "who may load which read-only screen,"
and `case.view_any` alone can't discriminate `/focal` from `/hod` from
`/dean` since all three roles hold it at once by design. Every dashboard
is read-only by this module's own explicit scope decision (D-083) —
action-taking forms for the routes M05-M11 already built are a real,
separable follow-on, not something this module's own done-criterion
needs. "Overdue eligibility" (D-084) reads as eligible-and-zero-cases —
the earliest real "at risk of not graduating" signal, directly answering
the module's own done-criterion on `/hod`.

Two real tooling gaps found and fixed, not by the user: Vitest's default
transform pipeline in this dependency version is Oxc (Rolldown's Rust
transformer), which silently ignores `esbuild.jsx` once both are
configured — no test had ever imported a `.tsx` file before this module
needed to test the PDF export, so this was invisible until now. Fixed by
disabling Oxc explicitly (`oxc: false`) alongside the `esbuild.jsx`
override in both Vitest configs (D-086). And a live-verification-script-
only issue: bare `tsx` CLI invocations default to the classic JSX
transform (needing `React` in scope) unlike Next's own automatic-runtime
SWC build — fixed with an explicit, harmless `import React from "react"`
in the one `.tsx` file outside `src/app`/`src/components`.

One real, more consequential test-fixture bug, a direct extension of
D-064's lesson from M10: two of this module's own tests needed G2
(BR-17, "time remains") to genuinely pass, and reused D-064's specific
41000-49999 numeric window without re-deriving whether it still held —
it didn't, because unlike the BR-prefixed files that established that
window (all sorting *before* `M03_...` alphabetically), every M13 file
sorts *after* it, so `M03_eligibility_route_ownership.test.ts`'s own
50000+ blocks — and `M03_semester_admin_routes.test.ts`'s
`nextSequenceNumber()`-assigned semesters, observed reaching into the
tens of millions in a real run — already exist by the time M13's tests
run. Fixed with a much higher, hundreds-of-millions block instead of a
narrow "below X" window (D-087) — a generalised version of the lesson
for whichever future module hits this next.

## Next action
Write `/docs/modules/M14.md`, then implement security headers, CSP,
rate limiting, CSRF, a dependency audit, the §9 penetration checklist,
a backup and restore rehearsal, an operator runbook, and an admin
training document. **Done when** a restore from backup into an empty
environment reproduces the system exactly. This is the master prompt's
final module (§7) — M14's own done-criterion doubles as the project's
overall acceptance bar (§11): "every business rule BR-01 to BR-28 has a
passing named test... a backup taken on one machine restores correctly
on another... the runbook is complete enough that a new administrator
can perform every operational task from it alone."

## Blocked on
- OQ-14 (BNU holiday calendar / weekend convention for BR-27's working-
  days clock) — restrictive default (Sat-Sun only, no holidays) applied
  in M12.
- OQ-13 (graduation boundary semester count) — restrictive default (8)
  applied in M10, inferred only from a seed-data hint; needs a real
  Registrar/HoD answer.
- OQ-09 (does a waiver appear on the transcript differently from a
  pass?) — genuinely open; M13's dashboards never conflate `WAIVER_
  GRANTED` with `CLOSED_PASS`, precisely so this can still be answered
  either way without a rewrite.
- OQ-04 (who holds the Dean role, is there a delegate) — both M10's
  escalation route and M11's final waiver signature already require one
  live `DEAN`-role account with no delegate mechanism; `/dean` now makes
  this visible on a real screen too.
- OQ-03 (confirm `RESTART_CAP` = 1) — the default is live and enforced
  by G4 as of M10; the number itself is still unconfirmed by the HoD.
- OQ-02 (completion certificate verification standard) — restrictive
  default (any single listed method) applied in M09.
- OQ-07 (document retention period) — doesn't block M13/M14, but the
  vault's eventual purge/retention behavior needs a real answer before
  M14's own backup/retention story is complete.
- OQ-08 (evaluation visibility to students) — restrictive default
  (hidden) applied in M08, exactly as the master prompt specified.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
