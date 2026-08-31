# Progress

**Current module:** none — M00 through M14 (all fifteen `MASTER_PROMPT.md`
§7 modules) and M15 (a post-master-prompt addition — see below) are all
complete.
**Last session:** 2026-08-31
**Build status:** green. `pnpm lint`, `pnpm exec tsc --noEmit`, `next
build`, `pnpm test` [241/241], `pnpm test:integration` [358/358] all
pass, confirmed on multiple consecutive freshly-recreated temp Postgres/
Redis runs. `pnpm audit` reports zero known vulnerabilities. A full,
real `docker compose up --build` from a clean volume state (all 7
services, every one reaching `healthy`) was exercised end to end: real
migrations applied via a builder-stage image, the runtime role
provisioned, seed data loaded, a real credentials login producing a
correctly-attributed session cookie, live CSP/HSTS/CSRF/security-header
proofs against the real containerized app (not just unit tests — see
`docs/SECURITY_CHECKLIST.md`), a real ClamAV EICAR positive against the
live antivirus service, and — the module's own literal done-criterion —
a real backup taken from the live stack restored into a completely
separate, empty Postgres instance, with every row count and the exact
`audit_events`/`case_events`/`grades` append-only privilege posture
verified to match the source exactly.

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
- [x] M14 Hardening, backup and handover
- [x] M15 Action-taking UI — **not** one of §7's fifteen modules; a
  post-master-prompt addition (`docs/modules/M15.md`) requested after
  M14 shipped, closing the gap between "every route exists and is
  tested" and "a person can actually use this."

## Where I stopped

### M15 — Action-taking UI

Implemented M15 in full per `/docs/modules/M15.md`. M13 (dashboards)
was deliberately read-only — every mutation from M05 through M09 had
a real, tested API route and no UI to reach it from. This module adds
one new screen, `/cases/:id`, and eleven action forms covering the
entire normal eight-step path (Student: open case, submit offer, log
progress, mark internship complete, upload completion certificate;
Focal: approve/reject offer, issue supervisor evaluation link, verify
a deliverable, mark fully verified, recommend grade; HoD: award
grade). Zero new server-side mutation logic — every form is a thin
client component (`src/components/action-form.tsx`, `src/components/
case-actions/*.tsx`) calling an already-existing, already-tested
`/api/**` route with the session cookie, gated by capability +
one-state comparison against the real transition table, never a
re-implementation of the real guards (D-101/D-102).

Proven with one real case walked start to finish against a full
`docker compose` stack — not per-form spot checks — from
`ELIGIBILITY_PENDING` through a real `CLOSED_PASS`, confirming at
every step that the right role sees the right form at the right state
and nothing else (an owning Student, a different Student — genuine
404, not 403 — Focal, HoD and Dean each rendering correctly different
subsets of the same page for the same case), and that
`isGraduationEligible` (BR-03, M14) independently flips to `true` as a
direct downstream consequence (D-104).

One real bug found in exactly that walkthrough, not by reading code:
`POST /api/cases/:id/supervisor-token` 500'd on the very first attempt
against a genuinely unreachable SMTP relay — an unhandled `sendMail()`
rejection, pre-existing since M08, invisible until this module's live
verification actually exercised the route outside its own mocked test
suite. Fixed for real (a clean `503 mail_unavailable`, safe to retry,
with a new negative test proving both the failure response and that a
retry doesn't leave a duplicate live token behind) rather than left as
a known gap — the same standard M14's own backup/restore bugs were
held to (D-103).

**Explicitly not built:** UI forms for the two "exception paths" (§1.2)
— the restart gate and the waiver path. Both are real, fully tested,
and reachable via the API/`docs/RUNBOOK.md` today; only their UI is a
deliberate, documented scope boundary (`docs/modules/M15.md`), kept
out to keep this addition finishable and honest about what it covers.

A ready-to-send questionnaire for BNU (`docs/BNU_QUESTIONNAIRE.md`)
was also written this session, compiling every item in
`docs/OPEN_QUESTIONS.md` into plain-language questions grouped by
which office should answer them — not something this codebase can
answer on its own, but worth having in a form someone can actually
send.

### M14 — Hardening, backup and handover

Implemented M14 in full per `/docs/modules/M14.md`. The single biggest
piece of this module was discovering — and fixing, for real, not just
documenting — three categories of gap that had survived all 13 prior
"complete" modules:

**Two entire business rules with zero implementation.** Auditing every
`BR-XX_*.test.ts` file against §4's full BR-01-to-BR-28 list (this
module's own done-criterion) found BR-03 ("no graduation-eligible mark
without a `CLOSED_PASS` case or an approved waiver") and BR-05
("cases missing deliverables at the semester deadline are flagged, not
auto-failed") with no code behind them anywhere, not just no test. Both
built for real this module (`src/server/roster/graduation.ts`,
`src/server/roster/deadline-sweep.ts`), following the same "computed at
query time, never stored or auto-acted-on" pattern BR-01/BR-04/BR-27
already established. See D-088.

**A capability that existed only in name.** `users.manage`
(`src/server/authz/matrix.ts`) has gated roster import and semester
routes since M02/M03, and §2.6/§3 both explicitly name "create and
deactivate user accounts" as one of Admin's own capabilities — but no
module ever built the route for it, meaning there was genuinely no way
to onboard a new Focal Person, exactly what §8.3's runbook is required
to cover. Built for real: `POST /api/admin/users` (staff-only, not
students — roster import stays the dedicated student path) and
`POST /api/admin/users/:id/deactivate`, reusing M02's existing
password-reset token mechanism for onboarding rather than inventing a
second one. See D-097.

**A backup/restore mechanism that had never actually worked.** Real,
full `docker compose up --build` verification — not `docker compose
config --quiet`, not trusting that the shell scripts typecheck — found
the backup sidecar's every scheduled dump had been silently failing
with a permission error since its very first start (a fresh named
Docker volume defaults to root ownership; the image never created
`/backups` to set it), invisible in `docker compose ps` because the
old healthcheck only proved the loop process was alive, not that it
was succeeding. Fixed, then a second bug surfaced immediately behind
it (`pg_dump`/`pg_restore` reject Prisma's own `?schema=public` URI
parameter outright). Fixed, then — the most consequential finding of
the whole module, caught only by actually rehearsing a full restore
into a separate empty database and diffing its live privilege grants
against the source's — a third: `pg_restore --clean` silently
re-widens BR-26's append-only revokes on `audit_events`/`case_events`/
`grades`, because dropping and recreating those tables re-triggers a
standing `ALTER DEFAULT PRIVILEGES` rule the init migration itself
sets, and a narrower `GRANT` statement afterward cannot undo a broader
privilege a different rule already applied. `restore.sh` now
reasserts the exact same `REVOKE` statements as an explicit final
step, verified twice — first reproducing the bug, then confirming the
fix — against a real, separate restored database. See D-098/D-099/
D-100 for the full account of all three.

Full §9 security checklist demonstrated live, not just unit-tested
where a unit test genuinely can't reach the thing being proven (the
CSP nonce mechanism, CSRF middleware, and session cookie attributes
all live in `src/middleware.ts`/Auth.js internals that the
established route-handler-direct-call integration test pattern cannot
exercise) — every item in `docs/SECURITY_CHECKLIST.md` is either a
named, runnable test or a captured live command-and-output pair
against the real containerized app. Rate limiting extended to the
three upload-accepting routes (§9 names file upload explicitly; none
had it). Notification delivery (`sendNotification()`) changed from
fully sequential to bounded-concurrency (`mapWithConcurrency`, limit
5) after building M14's own BR-05 sweep test — run at the tail of the
whole shared-database test suite by necessity (see below) — revealed
it scaling badly with (missed cases) x (recipients), and an
unbounded-`Promise.all` first attempt at fixing that instead exhausted
Prisma's connection pool badly enough to make *other, unrelated*
already-passing tests fail (D-095). A `pnpm audit` dependency audit
fixed all 7 findings directly (a direct `nodemailer` bump plus a
`pnpm.overrides` block for three transitive packages), none accepted
as unactionable risk, all verified against the real build pipeline and
test suite (D-096).

One real, structural test-suite lesson, generalizing D-087's already
partial fix: `computeEligibility()` counts every `CLOSED` semester in
the shared test database at or above a student's admission point,
globally, with no other scoping — so *any* new closed semester a test
file creates pollutes every other test's own eligibility/G2 math, for
any test with a lower admission point that runs *after* it. Neither a
low numeric block nor a high one structurally fixes this from an
early-sorting file — the position in run order is what matters, not
the magnitude of the number picked. `M14_BR03_graduation_eligibility
.test.ts` and `M14_BR05_deadline_missed.test.ts` are named to sort
after every other test file in the suite specifically to guarantee
nothing downstream can ever be polluted by them, rather than picking
"a high enough" block and hoping (D-094).

Three new top-level docs this module explicitly required:
`docs/SECURITY_CHECKLIST.md`, `docs/RUNBOOK.md` (deploy, upgrade,
backup, restore, staff onboarding/deactivation, roster/semester admin,
secret rotation, the ClamAV false-positive procedure, reading the
audit log — every one of §8.3's named topics, corrected in place
during real verification: the runtime `app`/`worker` image carries
neither `prisma/` nor a package manager, so migrations and seeding
route through a separately-built `builder`-stage image, and role
provisioning routes through `postgres`'s own bundled `psql` rather
than a script that assumes a tool no image in this project actually
ships), and `docs/ADMIN_GUIDE.md` (day-to-day use for Focal/HoD/Dean/
Admin, distinct from the RUNBOOK's infrastructure focus).

## Next action

Two real candidates, both explicitly scoped out rather than forgotten:

- **Restart-gate and waiver-path UI forms** — the same shape as M15's
  normal-path forms, for the two exception paths (§1.2). Every route
  they'd call already exists and is tested; this is UI-only work,
  same as M15 itself.
- **Real infrastructure to deploy to** — everything is deployment-
  ready (`docs/RUNBOOK.md` §1 is the exact, verified walkthrough), but
  standing up a real domain/server is outside what this codebase or
  session can do alone; needs a human decision on where.

Otherwise: the genuinely open items below are all policy questions for
BNU, not implementation gaps — `docs/BNU_QUESTIONNAIRE.md` is ready to
send.

## Blocked on

All of the below are compiled into one ready-to-send document,
`docs/BNU_QUESTIONNAIRE.md`, grouped by which BNU office should answer
each one.

- OQ-14 (BNU holiday calendar / weekend convention for BR-27's working-
  days clock) — restrictive default (Sat-Sun only, no holidays) applied
  in M12.
- OQ-13 (graduation boundary semester count) — restrictive default (8)
  applied in M10, inferred only from a seed-data hint; needs a real
  Registrar/HoD answer.
- OQ-09 (does a waiver appear on the transcript differently from a
  pass?) — genuinely open; no dashboard anywhere conflates `WAIVER_
  GRANTED` with `CLOSED_PASS`, precisely so this can still be answered
  either way without a rewrite.
- OQ-04 (who holds the Dean role, is there a delegate) — M10's
  escalation route and M11's final waiver signature both require one
  live `DEAN`-role account with no delegate mechanism.
- OQ-03 (confirm `RESTART_CAP` = 1) — the default is live and enforced
  by G4 as of M10; the number itself is still unconfirmed by the HoD.
- OQ-02 (completion certificate verification standard) — restrictive
  default (any single listed method) applied in M09.
- OQ-07 (document retention period) — the vault never deletes a file
  regardless (§9), but the actual retention *period* number is still
  needed for a real purge policy, not blocking anything built so far.
- OQ-08 (evaluation visibility to students) — restrictive default
  (hidden) applied in M08, exactly as the master prompt specified.
- OQ-01 (per-semester document deadlines) — BR-05's sweep mechanism is
  real and live as of M14, but stays dormant (never flags anything)
  until real dates are actually set on each semester; see M14's own
  resolution-log entry in `docs/OPEN_QUESTIONS.md`.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
- OQ-11/OQ-12 — both resolved with real implementations (M05, M11
  respectively); kept in the table per the log's own append-only
  convention.
