# Progress

**Current module:** M09 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the full M08 arc — issue a token, fetch the public view
(student name/company/dates only), submit an evaluation, confirm a
replay returns `already_submitted` and no duplicate row, confirm the
token audit event, issue a replacement and confirm the first token is
untouched — exercised directly against the real compose-network
database with the real `SESSION_SECRET`-derived HMAC, not just in
tests. `pnpm lint`, `pnpm typecheck`, `pnpm test` [152/152],
`pnpm test:integration` [218/218] all pass, confirmed on two consecutive
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
- [ ] M09 Verification and grading  <- up next, not started

## Where I stopped
Implemented M08 in full per `/docs/modules/M08.md`:
`src/server/supervisor/` (`token-protocol.ts`'s HMAC-then-hash
construction — MASTER_PROMPT.md §9's "HMAC-signed... and stored hashed"
taken as two separate properties; `service.ts`'s issue/lookup/submit
core; `reminders.ts`'s BR-28 detection). Four routes:
`POST /api/cases/:id/supervisor-token` (FOCAL, issues or replaces —
same code path either way, since the service always revokes any live
token first), the public, no-login `GET`/`POST /api/supervisor/evaluate/
:token` (student name/company/dates only on GET; locks the token on
POST; a replay on either gets a distinct `already_submitted` response,
not a generic error — this module's own stated done criterion), and
`GET /api/cases/:id/evaluation` (Focal/HoD unconditionally, Student only
behind the new `SHOW_EVALUATION_TO_STUDENT` flag, default hidden —
MASTER_PROMPT.md §9 gave the exact interim behaviour, OQ-08 updated).
`src/app/api/supervisor/**` added to the mutating-route ESLint rule's
exclusion list alongside `src/app/api/auth/**` — the same "no identity
to check" reasoning M02 already established.

Found and fixed a real, previously-undiscovered schema gap while
building this module: no field anywhere stored a human's display
name — `User` only ever had `email`. Nothing before M08 needed to show
one; the public supervisor page (§2.5) is the first thing that does.
Added `User.fullName` (nullable, not backfilled — existing fixtures and
already-imported students aren't rewritten just for this), with
`src/server/roster/csv-import.ts` accepting an optional `fullName`
column going forward and the public page falling back to the student's
registration number when unset.

BR-28's reminder/escalation *detection* is real
(`classifyTokenForReminder()`, `recordReminderSent()`, both tested) but
the actual BullMQ schedule and reminder emails stay unbuilt — M12 owns
"BullMQ jobs for reminders... the BR-28 supervisor escalation... email
templates... versioned" explicitly, a direct overlap with M08's own
one-line summary that got resolved the same way M04 divided BR-07/08/
09/10/11 among the modules that actually own each guard.

## Next action
Write `/docs/modules/M09.md`, then implement verification and grading:
per-deliverable verification with a mandatory method (BR-11 — the
`Verification` model, M01, is already built and unused), the
three-item checklist gate (BR-10 — this is the module that finally
gets to replace `stubGuard("BR-10")` on row 9 for real, now that all
three deliverables have somewhere to come from: `OFFER_LETTER`/
`COMPLETION_CERTIFICATE` documents from M06, the `Evaluation` row from
M08), grade recommendation by Focal Person and award by HoD (rows 11-13
of the transition table — `recommenderNotAwarder` already exists from
M04 and just needs a real caller), and BR-14's reversal-with-Dean-
signature mechanism (`GradeReversal`, M01, also already built and
unused).

## Blocked on
- OQ-12 (waiver states vs. case transitions) — restrictive default
  applied in M04; M11 (waivers) should confirm or correct this.
- OQ-02 (what counts as acceptable verification of a completion
  certificate) — directly blocks how strict M09's BR-11 method
  selection should be; restrictive default (any of the four listed
  methods is acceptable, no cross-checking enforced) will need applying
  explicitly when M09 starts.
- OQ-07 (document retention period) — doesn't block M08/M09, but the
  vault's eventual purge/retention behavior needs a real answer before
  M14's backup/retention story is complete.
- OQ-08 (evaluation visibility to students) — restrictive default
  (hidden) applied in M08, exactly as the master prompt specified; the
  underlying policy question stays with the HoD.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
