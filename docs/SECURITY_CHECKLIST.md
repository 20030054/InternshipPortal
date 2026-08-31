# Security checklist

Maps every item in `MASTER_PROMPT.md` §9 to the real thing that proves
it — an automated test (name given, runnable today), or a live
demonstration against the actual `docker compose` stack (command and
observed result given, performed during M14's own verification pass —
see `docs/DECISIONS.md` D-088 through D-100 for the full narrative,
including three real bugs this exact process found and fixed). §9
itself says "these are acceptance criteria, not suggestions... not
complete until each is demonstrated" — this document is that
demonstration, not a restatement of the requirement.

---

## Data integrity

**`audit_events` is append-only at the database privilege level.**
Proven by `tests/integration/BR26_audit_append_only.test.ts`: a direct
`UPDATE`/`DELETE` as `scit_app` fails with a Postgres permission error,
not an application-level check. Re-proven live during the M14 restore
rehearsal specifically *after* a restore (not just against a freshly
migrated database) — see "Backup/restore preserves this guarantee"
below.

**`cases.state` is writable only by the transition function, enforced
by trigger.** `tests/integration/BR25_state_write_trigger.test.ts`: a
direct `UPDATE cases SET state = ...` is rejected by the
`BEFORE UPDATE` trigger even as a role that otherwise has `UPDATE` on
the table.

**Grades are immutable; reversal is the only path to changing one.**
`tests/integration/BR14_grades_immutable.test.ts` (direct `UPDATE`
attempt fails) and `BR14_grade_reversal.test.ts` (the real reversal
mechanism, requiring a Dean signature, `grade.reverse`).

**No API route accepts a client-supplied state/role/grade/user ID for
authorization.** `tests/integration/M02_no_role_from_request_body.test.ts`
proves the general pattern; every ownership-sensitive route
additionally proven via the "404, not 403" tests below (identity comes
from the session, target resource from the URL, ownership checked
against the row).

**All timestamps are server-generated `timestamptz`.** No route in
this codebase accepts a client-supplied timestamp for anything that
matters (`createdAt`/`sentAt`/`signedAt`/etc. are all `@default(now())`
or set by server code — checked directly against
`prisma/schema.prisma`; there is no Zod schema anywhere in `src/schemas/`
that accepts a date field feeding a `*_at` column).

---

## Access control

**Every mutating route calls `requireCapability()`.** Enforced by a
custom ESLint rule, not just convention — proven by
`tests/unit/require-capability-lint-rule.test.ts`, which runs the real
rule against the real project and asserts it flags a route that
doesn't call it. `pnpm lint` (part of CI) fails the build otherwise.

**Resource identifiers are UUIDv7, never sequential integers.** Every
model in `prisma/schema.prisma` uses `@default(uuid(7))`; confirmed by
`tests/integration/schema.test.ts`'s full-schema check plus direct
inspection (`grep -c "uuid(7)" prisma/schema.prisma` matches every
`@id` column with no exceptions).

**Ownership is checked on the row, not inferred from the role — "404,
not 403."** Proven per-resource: `M02_no_cross_student_read.test.ts`
(a Student reading another Student's own record), `M03_eligibility_
route_ownership.test.ts`, `M05_offer_route_ownership.test.ts`,
`M14_admin_user_management.test.ts` (this module's own new routes).
Every one of these tests asserts a `404`, not a `403` — a Focal Person
from another department (§9's own named scenario, should SCIT ever
share the deployment) would see nothing, not "forbidden" (which itself
leaks that a resource exists).

**The API forbids what the UI hides — tested at the API, not the
UI.** Every capability in §3's authority matrix has at least one
integration test calling the real route handler with a
lower-privileged session and asserting `401`/`403`; `tests/unit/
matrix.test.ts` additionally proves the matrix itself matches §3 row
for row, including the two real gaps found beyond it (`grade.reverse`,
D-058; `users.manage`'s two missing routes, D-097).

---

## Files

**Uploads validated by extension *and* magic bytes *and* MIME, scanned
by ClamAV, stored under a UUID filename.**
`tests/integration/M06_upload_hardening.test.ts` proves every rejection
path (wrong extension, wrong magic bytes, oversized, MIME mismatch)
against the real validation code. ClamAV itself proven live during
M14's verification pass, against the real `clamav` compose service —
not the mocked `scanBuffer()` the fast test suite uses (see D-038):
```
$ docker compose exec clamav clamdscan --stream /tmp/eicar.txt
/tmp/eicar.txt: Eicar-Test-Signature FOUND
----------- SCAN SUMMARY -----------
Infected files: 1
```
A genuine EICAR positive against the real virus database, not a mock.

**Path traversal is impossible; filenames are generated, not
accepted.** `storeDocument()` (`src/server/documents/store.ts`) never
uses the client-supplied original filename to build a storage path —
proven by `M06_upload_hardening.test.ts`'s own assertions on the
stored `storageKey` shape.

**Downloads stream through an authenticated handler with
`Content-Disposition: attachment` and `X-Content-Type-Options:
nosniff`.** `tests/integration/M06_document_download.test.ts`.

**No file is ever deleted; superseded files are flagged and
retained.** `tests/integration/M06_document_supersede.test.ts` proves
a re-upload marks the prior `ACTIVE` row `SUPERSEDED` rather than
deleting it; the `documents_forbid_reactivation` trigger (D-011)
additionally makes going back from `SUPERSEDED` to `ACTIVE`
structurally impossible, at the database level.

---

## Sessions and secrets

**HttpOnly, Secure, SameSite=Lax cookies.** `httpOnly`/`sameSite` are
explicit config (`src/server/auth/config.ts`); `secure` is
deliberately left to Auth.js's own environment-aware default rather
than hardcoded (D-091 — hardcoding it would break `next dev` over
plain HTTP entirely). Proven live against the real containerized app
(this class of behavior can't be exercised by the route-handler-direct-call
integration test pattern — there is no real HTTP response to inspect):
```
$ curl -s -D - -X POST http://localhost/api/auth/callback/credentials ...
Set-Cookie: authjs.session-token=...; Path=/; Expires=...; HttpOnly; SameSite=Lax
```
`HttpOnly`/`SameSite=Lax` present; `Secure` correctly absent here
because this demonstration ran over plain HTTP (`APP_URL=http://localhost`,
no TLS) — the same code path sets `Secure` automatically once Caddy is
actually terminating HTTPS in front of it, which is what every real
deployment does (§8.1).

**Supervisor tokens are HMAC-signed, single-use, expiring, stored
hashed.** `tests/integration/M08_supervisor_token_issue.test.ts` and
`M08_supervisor_evaluation_flow.test.ts` (the single-use/expiry
enforcement).

**Rate limits on login, password reset, supervisor token submission,
and file upload.** `M02_login_lockout.test.ts` (login), `M02_password_
reset_flow.test.ts` (reset), the supervisor token tests (submission),
and — M14's own gap, §9 names file upload explicitly and no route had
it — `tests/integration/M14_upload_rate_limit.test.ts` (10/hour per
user, shared across all three upload-accepting routes; see D-095 for
why delivery had to become concurrency-bounded rather than sequential
once this and the rest of §9's rate limits compound with M14's own
notification-delivery changes).

**Full CSP (no `unsafe-inline` on `script-src`), HSTS, `X-Frame-Options:
DENY`.** The CSP nonce mechanism specifically cannot be proven by a
unit test — Next.js reads its own nonce back out of the *request's*
CSP header at render time (D-089), which only a real render exercises.
Proven live against the real containerized build:
```
$ curl -s -D - http://localhost/login | head -20
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-YWY1...' 'strict-dynamic'; ...
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
Referrer-Policy: strict-origin-when-cross-origin
```
and every script tag on the rendered page carries the *same* nonce as
the header (`grep -c` of `<script` tags vs. nonce-bearing `<script`
tags: 10 and 10 — an exact match, not a subset). `tests/unit/
csrf.test.ts` separately proves the CSRF half of `src/middleware.ts`
(Origin/Referer validation, D-090) as pure functions; live-proven too:
```
$ curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost/api/waivers/.../approve   # no Origin/Referer
403
$ curl -s -o /dev/null -w "%{http_code}" -X POST ... -H "Origin: http://evil.example.com"
403
$ curl -s -o /dev/null -w "%{http_code}" -X POST ... -H "Origin: http://localhost"
401   # past CSRF, correctly falls through to "unauthenticated" (no session)
```

---

## Privacy

**Students see only their own data; no student directory.**
`tests/integration/M02_no_cross_student_read.test.ts`; there is no
`GET /api/students` (list) route anywhere in `src/app/api` — only
`GET /api/students/:id`, which is ownership-gated.

**Supervisor-facing pages leak nothing beyond name, company, dates.**
`tests/integration/M08_evaluation_visibility.test.ts` and the
supervisor evaluation route's own field selection (checked directly:
`src/app/api/supervisor/evaluate/[token]/route.ts` selects only
`{studentName, companyName, plannedStart, plannedEnd}`-shaped fields,
nothing else off the `Case`/`Student` rows).

**Evaluation comments hidden from students by default, config flag to
reveal.** `SHOW_EVALUATION_TO_STUDENT` (default `false`), proven by
`tests/integration/M08_evaluation_visibility.test.ts`'s both-states
coverage.

**No document contents/tokens/passwords/full evaluation text in
logs.** Not automated (scanning application log output for the
*absence* of a category of content has no clean test boundary in this
codebase) — enforced by convention and code review: `grep -rn
"console.log\|logger\." src/server` was checked directly during this
module and found no call site that logs a raw token, password, file
buffer, or evaluation `comments` field; every log line in this
codebase logs IDs and status, never payload content.

**Retention policy.** Case records: retained permanently (real
academic records — no delete route exists for a `Case` anywhere).
Documents: retained per §9's own "no file is ever deleted" rule above
(superseded, never removed) — the actual retention *period* number is
OQ-07 in `docs/OPEN_QUESTIONS.md`, still genuinely open (Registrar
policy, not this codebase's call). Audit: retained permanently (same
mechanism as `audit_events`' append-only guarantee above — nothing
in this system, at any privilege level, can delete an audit row).

---

## Every BR-01 through BR-28 has a passing named test

The module's other done-criterion. Verified directly: every `BR-XX`
identifier from `MASTER_PROMPT.md` §4 has at least one test file whose
name starts with that identifier, or (BR-25/BR-26, database-trigger
rules with no service-layer counterpart) is proven in a differently-named
file whose `describe()` block names the rule explicitly. BR-03 and
BR-05 (`M14_BR03_graduation_eligibility.test.ts`, `M14_BR05_deadline_
missed.test.ts`) are this module's own closes — see D-088.

## The full suite, run fresh, twice

`pnpm test` (241 tests) and `pnpm test:integration` (357 tests) both
pass at 100%, run against a freshly recreated, empty Postgres/Redis —
not a database that happened to accumulate compatible state — twice
in a row, per this project's own established verification standard.
`pnpm lint` and `pnpm exec tsc --noEmit` are both clean. `pnpm audit`
reports zero known vulnerabilities (D-096).
