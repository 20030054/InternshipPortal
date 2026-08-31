# Decisions

Append-only. Never edit or delete a past entry — if a decision is reversed,
add a new entry that says so and links back to the one it supersedes. Newest
at the bottom.

---

### D-001 — 2026-08-30 — Docs-only first session, no application code

**Decision:** Session 1 creates only the `/docs` skeleton (`PROGRESS.md`,
`CONVENTIONS.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`, `ARCHITECTURE.md`,
`modules/M00.md`, `modules/M01.md`). No Dockerfile, no `package.json`, no
source code.

**Why:** `MASTER_PROMPT.md` §13 explicitly says "Do not write application
code yet" for the first session, and §0.2 mandates one module per session.
Writing code before M00 has a spec would violate both.

---

### D-002 — 2026-08-30 — Single-app repo layout, not a workspace monorepo

**Decision:** One Next.js application at the repo root (`/src`, `/prisma`,
`/tests`), not a pnpm/turborepo workspace with separate packages.

**Why:** There is exactly one deployable unit (the `app` image; `worker` is
the same image with a different start command per §8.1). A workspace tool
buys nothing here and adds config surface a small team would have to
maintain. If a genuinely separate package emerges later (e.g. a shared
types package consumed by something outside this repo), revisit.

---

### D-003 — 2026-08-30 — pnpm as package manager

**Decision:** Use pnpm for dependency management and scripts.

**Why:** Strict node_modules resolution catches phantom dependencies early,
faster CI installs via its content-addressable store, single lockfile. Not
mandated by `MASTER_PROMPT.md` §6 (which is silent on package manager); this
is a build-tooling choice within the stack it does specify.

---

### D-004 — 2026-08-30 — Capabilities named as `verb.object` strings, not role checks

**Decision:** The authority matrix (`src/server/authz/matrix.ts`, to be
built in M02) is keyed by capability strings like `offer.approve`,
`grade.award`, `restart.countersign`, never by role name in calling code.

**Why:** `MASTER_PROMPT.md` §2 and §3 are explicit that authority is
"enumerated, not inherited" and that a route checks a capability, not a
role — this makes that structurally hard to violate, since there is no
`if (role === 'FOCAL')` pattern available to reach for.

---

### D-005 — 2026-08-30 — Conventional commits, one module's work per commit series

**Decision:** Commit messages follow Conventional Commits
(`feat(m05): ...`), and a module's implementation lands as one commit or a
short series that corresponds to the `/docs/PROGRESS.md` "Completed
modules" checkbox flipping.

**Why:** Makes `git log` a second, cheaper index into what happened per
module without needing to re-read `PROGRESS_ARCHIVE.md`, consistent with
the token-discipline goal in §0.2.

---

### D-006 — 2026-08-30 — Dependencies pinned to exact patch versions, not ranges

**Decision:** `package.json` pins every dependency to an exact resolved
version (`"next": "15.5.24"`, not `"^15.5.24"`), matched by
`pnpm-lock.yaml`.

**Why:** A university team maintaining this for years benefits more from
"upgrades are a deliberate, reviewed action" than from automatically
absorbing patch releases. Combined with `pnpm install --frozen-lockfile` in
both CI and the Dockerfile's `deps` stage, this means the exact same
dependency tree is built in dev, CI and production every time, with no
"works on my machine" gap from a minor version drifting between them.

---

### D-007 — 2026-08-30 — `pg` and `ioredis` used directly for M00's readiness probe

**Decision:** `/api/ready` (`src/server/health/checks.ts`) connects with
`pg`'s `Client` and `ioredis` directly, rather than waiting for Prisma
(M01) or BullMQ (M12) to exist.

**Why:** M00 has no schema and no job queue yet — a readiness probe only
needs to prove the database and Redis are reachable, which is exactly what
these two libraries do at their lowest level, with no dependency on
anything M01/M12 will introduce. Both `pg` and `ioredis` are already
committed in `MASTER_PROMPT.md` §6.1 (`ioredis` as BullMQ's transitive
dependency, `pg` implicitly via Prisma's Postgres driver), so this isn't a
new addition to the stack, just an early direct use of a library the stack
already requires.

---

### D-008 — 2026-08-30 — Worker healthcheck is a heartbeat file, not the app's HTTP probe

**Decision:** The `worker` compose service overrides the image's inherited
`HEALTHCHECK` (which probes `GET /api/health` on port 3000) with a check
that reads the mtime of `/tmp/healthy`, a file `worker/index.mjs` touches
every 15 seconds.

**Why:** `worker` never opens an HTTP port — reusing the app's HTTP
healthcheck would always fail. A heartbeat file is the simplest signal that
survives the rewrite to a real BullMQ `Worker` in M12 (a stalled event loop
stops writing the file and the container is correctly reported unhealthy).

---

### D-009 — 2026-08-30 — `next-env.d.ts` and `*.tsbuildinfo` are gitignored

**Decision:** Both are excluded from version control, matching current
`create-next-app` convention (older Next.js starters committed
`next-env.d.ts`; current ones don't).

**Why:** `next-env.d.ts` is regenerated by `next dev`/`next build` on every
run and carries no information beyond a couple of `/// <reference>` lines;
committing it just invites merge noise. `*.tsbuildinfo` is `tsc`'s
incremental-build cache — pure derived state, machine-specific, safe to
delete anytime.

---

### D-010 — 2026-08-30 — Native Postgres enums instead of CHECK constraints for fixed-value columns

**Decision:** `cases.state`, `grades.value`, `documents.type`/`status`,
`verifications.method`, and every other fixed-vocabulary column
(`RoleName`, `SemesterType`, `RestartOutcome`, `WaiverOutcome`,
`EscalationSubjectType`, `NotificationStatus`) are native Postgres enum
types (`CREATE TYPE ... AS ENUM (...)`), generated by Prisma from `enum`
declarations in `schema.prisma` — not `TEXT` columns with a `CHECK (value
IN (...))` constraint.

**Why:** `docs/modules/M01.md` originally described `cases.state` as "text,
constrained by a CHECK." A native enum enforces the identical guarantee
(an out-of-list value is rejected at the database level) through Prisma's
idiomatic mechanism, with the added benefit that Prisma Client's generated
TypeScript types are a real union type, not a bare `string` — a second,
compile-time layer of the same constraint, matching CONVENTIONS.md's "no
`enum`... use string literal union types... matched by a Zod schema"
guidance at the *application* layer while still getting a real constraint
at the *database* layer.

---

### D-011 — 2026-08-30 — Document reactivation is enforced by a trigger, not a CHECK

**Decision:** `documents.status` moving from `SUPERSEDED` back to `ACTIVE`
is rejected by a `BEFORE UPDATE` trigger (`documents_forbid_reactivation`),
not a `CHECK` constraint.

**Why:** `docs/modules/M01.md` originally described this as "a CHECK that
disallows going back to ACTIVE," which is not something a CHECK constraint
can express — CHECK constraints validate a single row's values in
isolation and have no access to the row's previous state (`OLD`). Only a
trigger can compare `OLD.status` to `NEW.status`. This is the same
mechanism class as the `cases.state` write-guard trigger (BR-25), just
answering a narrower question ("did status regress?") rather than "was
this write authorized at all?".

---

### D-012 — 2026-08-30 — Role creation and grants live in the init migration, not the seed script

**Decision:** `CREATE ROLE scit_app`, its `GRANT`s, and the `REVOKE
UPDATE, DELETE` restrictions on `audit_events`/`case_events`/`grades` are
raw SQL appended to `prisma/migrations/*_init/migration.sql` — applied by
`prisma migrate deploy` — not statements run by `prisma/seed.ts`.

**Why:** `docs/modules/M01.md` originally said "seed script grants these
explicitly after migration." That's wrong in a way that matters: standard
Prisma practice is that `prisma migrate deploy` runs in every environment
including production, while `prisma db seed` is a dev/demo-data convenience
that a real production deploy has no reason to ever run. If the privilege
restrictions only existed in the seed script, a production deployment
would apply the full open-CRUD default grant and never revoke anything —
BR-26's audit immutability guarantee would be silently unenforced exactly
where it matters most. Migrations are the only artifact guaranteed to run
everywhere the schema itself does, so that's where privilege changes
belong.

The role is created via `LOGIN` with no password (a role with `LOGIN` and
no password set cannot authenticate), so no secret is ever committed to a
version-controlled migration file. `scripts/db/provision-runtime-role.sh`
sets the real password afterward from `DATABASE_APP_ROLE_PASSWORD`. The
role name is fixed as `scit_app` (not read from `DATABASE_APP_ROLE` at
migration time) because a static SQL migration file can't be templated by
an environment variable at apply time; `DATABASE_APP_ROLE=scit_app` in
`.env.example` documents the fixed name rather than configuring it.

---

### D-013 — 2026-08-30 — `prisma generate` runs explicitly in the Dockerfile's builder stage

**Decision:** The `builder` stage runs `pnpm exec prisma generate`
explicitly, after `COPY . .` and before `pnpm build` — with a placeholder
`DATABASE_MIGRATION_ROLE` set via `ENV` just for that step (overridden by
the real value from `.env` at container runtime).

**Why:** The `deps` stage installs from only `package.json` +
`pnpm-lock.yaml` (see D-006's `--frozen-lockfile` reasoning — this also
keeps that layer's cache key scoped to dependency changes, not schema
changes). That means `@prisma/client`'s postinstall hook runs with no
`prisma/schema.prisma` in its build context yet, generates nothing useful,
and `next build` in the `builder` stage then fails typechecking anything
that imports `@prisma/client`'s generated types (discovered when
`prisma/seed.ts`'s `RoleName` import broke the M01 Docker build — the
error was real, not a fluke). `prisma generate` never opens a database
connection, but does check that its datasource's referenced env var
exists; the placeholder value satisfies that without leaking anything,
since docker-compose's `env_file: .env` overrides it before the app ever
runs a query.

---

### D-014 — 2026-08-30 — Dockerfile installs OpenSSL in every stage that touches Prisma

**Decision:** `deps`, `builder`, and `runtime` all run
`apt-get install -y --no-install-recommends openssl` before anything
Prisma-related executes.

**Why:** M00's Dockerfile carried a `TODO(M01)` flagging this as unverified
("confirm whether the query engine needs libssl"). It does: without it,
Prisma's engine postinstall step prints "Prisma failed to detect the
libssl/openssl version to use... Defaulting to openssl-1.1.x" — a guess
that may not match what's actually on the base image, risking a runtime
failure the moment the query engine binary is actually invoked. Installing
`openssl` lets Prisma detect the real version instead of guessing.

---

### D-015 — 2026-08-30 — JWT sessions with a `tokenVersion` counter, not Auth.js's database adapter

**Decision:** Auth.js is configured with `session: { strategy: "jwt" }`
and no `adapter`. Session invalidation (password change, role change,
account disable) is achieved by re-reading `tokenVersion`/roles/
`disabledAt` from the database on every request (`loadIdentity()`,
called from both the `jwt` callback and, independently, from
`getCurrentIdentity()`) rather than by Auth.js's own database-session
mechanism.

**Why:** The official `@auth/prisma-adapter` expects its own
`Account`/`Session`/`VerificationToken` tables, none of which this system
needs — there are no OAuth providers configured (OQ-05 is unanswered, and
the restrictive default is credentials-only). Adopting the adapter now
would mean carrying three unused tables and a dependency on their exact
shape purely on the chance OIDC arrives later; adding the adapter *when*
an OAuth provider is actually configured is a smaller, better-timed
change than removing three empty tables would be. The `tokenVersion`
counter achieves the one thing that pattern actually exists for here
(forced invalidation) with a single integer column.

---

### D-016 — 2026-08-30 — `requireCapability()` re-validates identity independently of Auth.js's `jwt`-callback-returns-`null` behavior

**Decision:** `getCurrentIdentity()` (src/server/auth/current-identity.ts)
re-reads the user's `tokenVersion` from the database and compares it to
the session's embedded copy, rejecting a mismatch — even though the `jwt`
callback in `config.ts` already does its own freshness check and can
return `null` to invalidate a token at the Auth.js level.

**Why:** Auth.js v5's `jwt` callback return type is documented as
`Awaitable<JWT | null>`, and returning `null` is Auth.js's supported
mechanism for invalidating a session server-side — this is real and used
here too. But making `requireCapability()`'s security guarantee depend
entirely on trusting that one framework behavior, in a beta-tagged
package (`next-auth@5.0.0-beta.32` — 5.x has no stable release), was a
risk not worth taking for the property M02's own done criterion is
built around. The second check costs one extra indexed read and makes the
guarantee hold regardless of exactly how Auth.js's internals evolve.

---

### D-017 — 2026-08-30 — `CredentialsSignin` (and anything else `authorize()` needs) imported from `@auth/core`, not `next-auth`

**Decision:** `src/server/auth/authorize-credentials.ts` imports
`CredentialsSignin` from `@auth/core/errors`, and `@auth/core` is an
explicit direct dependency pinned to the same version `next-auth`
resolves it to (0.41.3) — not imported from the top-level `next-auth`
package.

**Why:** Discovered while writing M02_login_lockout.test.ts:
`next-auth`'s main entry point transitively imports `next/server`, which
fails to resolve when the module graph is loaded outside Next.js's own
bundler — exactly the situation for a Vitest test that imports
`authorize-credentials.ts` directly rather than going through a Next.js
route. `@auth/core` is the framework-agnostic package `next-auth` itself
re-exports this class from, so switching the import source changes
nothing about the actual error type or behavior — it just avoids pulling
in Next.js-specific code that a plain Vitest process can't load.

---

### D-018 — 2026-08-30 — Password minimum length, lockout threshold/window, reset token TTL, and session lifetime are implementation defaults, not open questions

**Decision:** None of the following are listed in `OPEN_QUESTIONS.md`;
all are logged here as defensible defaults a future session may revisit
if the department has an actual policy preference:
- Minimum password length: 12 characters.
- Brute-force lockout: 5 failed attempts, 15-minute lock.
- Login rate limit: 10 attempts / 15 minutes / IP.
- Password-reset rate limit: 5 requests / hour / IP.
- Password-reset token TTL: 1 hour, single-use.
- Session lifetime: 8 hours, sliding renewal every 1 hour of activity.

**Why:** `MASTER_PROMPT.md` §12's open-questions list is for things
genuinely blocked on departmental policy (deadline dates, the restart cap,
who holds the Dean role). These six numbers are security engineering
defaults with no policy content — nobody at SCIT has an opinion on
argon2 password length the way they have one on the restart cap. Treating
them as open questions would just be a way of not deciding something that
was always the implementer's call.

---

### D-019 — 2026-08-30 — Semester ordering is an explicit `sequenceNumber`, not type+year arithmetic

**Decision:** `semesters.sequence_number` is an admin-assigned integer,
unique across the table, set explicitly at semester creation (defaulting
to `MAX(sequence_number) + 1` if not given). BR-01/BR-04 eligibility math
counts `CLOSED` semesters by this number, never by comparing `type` and
`year`.

**Why:** Deriving chronological order from `type`+`year` requires baking
in one academic-calendar convention (e.g., "Fall precedes the following
Spring precedes the following Summer") that might not match BNU's actual
one, and breaks silently if a semester is ever created out of that
assumed order. An explicit, human-assigned sequence removes the
guesswork entirely — the registrar states the order, the system never
infers it.

---

### D-020 — 2026-08-30 — "Current semester" is admin open/close, not date-range inference

**Decision:** `semesters.status` (`UPCOMING`/`OPEN`/`CLOSED`) is set only
by explicit admin action (`POST /api/admin/semesters/:id/open` /
`.../close`), never inferred by comparing today's date to
`[startsOn, endsOn]`. A partial unique index enforces at most one `OPEN`
row at a time.

**Why:** Not a judgement call — `MASTER_PROMPT.md` §2.6 names "open/close
semesters" as a specific Admin capability, so the mechanism is specified,
not invented. It's also more robust in practice: a semester's real start
often slips a few days from its planned date, and inferring "current" from
a stale date range would silently misclassify eligibility right at the
boundary that matters most.

---

### D-021 — 2026-08-30 — BR-02's auto-enrolled case is created directly in ELIGIBLE, skipping ELIGIBILITY_PENDING

**Decision:** `runAutoEnrollmentSweep()` creates the mandatory case with
`state: "ELIGIBLE"` in a single `INSERT`, never passing through
`ELIGIBILITY_PENDING`.

**Why:** See `OPEN_QUESTIONS.md` OQ-11 for the full reasoning — in short,
M03 never auto-creates a case for the normal 4-semester eligibility path
(that's read as student action, M05's job), so BR-02's fallback case has
no prior `ELIGIBILITY_PENDING` row to transition *from*. Creating it
already-eligible is the only reading consistent with "the system creates
a mandatory case" being the trigger event, not a multi-step process. This
is a fresh `INSERT`, not an `UPDATE` of `cases.state`, so it needs no
transition executor (M04) to do correctly — the `BEFORE UPDATE OF state`
trigger from M01 never fires on `INSERT`.

---

### D-022 — 2026-08-30 — Dockerfile: full node_modules + src/ copied to runtime, `output: "standalone"` removed

**Decision:** `next.config.ts` no longer sets `output: "standalone"`.
The Dockerfile's `runtime` stage now copies the builder stage's complete
`node_modules`, the raw `src/` tree, and `tsconfig.json` — not just
Next's pruned standalone bundle. `app` runs via
`node node_modules/next/dist/bin/next start`; `worker` runs via
`node node_modules/tsx/dist/cli.mjs worker/index.ts`, executing real
TypeScript directly against the same source tree the app is built from.

**Why:** M03 is the first module where `worker` does real work —
consuming a BullMQ queue and running `src/server/roster/
auto-enrollment-sweep.ts` on a schedule. Next's file tracer (what
`standalone` output relies on) only follows imports reachable from the
Next.js app itself; it has no way to know a separate process needs
`bullmq` or `tsx`. The alternative — reimplementing the sweep a second
time in worker-only plain JavaScript, untyped and duplicated — was
rejected as strictly worse than a larger image. First attempt at this
fix only copied `node_modules`, still missing raw `src/`; the worker
failed immediately with `ERR_MODULE_NOT_FOUND` on its very first
container start (tsx compiles `worker/index.ts` on the fly from source —
the compiled `.next` output the app runs from doesn't help it at all).
Caught by actually starting the container, not just building the image.

**Trade-off, stated plainly:** the runtime image now carries
devDependencies (`typescript`, `eslint`, `vitest`, …) it never executes,
larger than a truly pruned image would be. Accepted for a self-hosted,
single-tenant university deployment where image size isn't a
cold-start-sensitive concern; M14 (hardening) can revisit with a proper
worker bundler if a leaner image ever becomes worth the added build
complexity.

---

### D-023 — 2026-08-30 — BullMQ 6.x: `upsertJobScheduler`, not `Queue.add({ repeat })`

**Decision:** `worker/index.ts` registers the roster-sweep schedule via
`queue.upsertJobScheduler("roster-sweep-schedule", { every: ... }, ...)`.

**Why:** Not a design choice so much as a version fact worth recording:
BullMQ 6.x removed `repeat` from `JobsOptions` entirely (a TypeScript
compile error caught it, not a runtime surprise) — repeatable jobs are
now `Queue.upsertJobScheduler()`'s job specifically. It's idempotent by
scheduler ID, which is what makes calling it unconditionally on every
worker startup safe (no duplicate schedules from a restart or a brief
two-worker overlap during a rolling deploy).

---

### D-024 — 2026-08-30 — CSV-only roster import; XLSX deferred

**Decision:** `src/server/roster/csv-import.ts` parses CSV only.

**Why:** OQ-06 (roster source/format) is unanswered. `MASTER_PROMPT.md`
§7 lists "CSV/XLSX" for this module, not "CSV and XLSX both, day one" —
CSV is universally exportable from any real SIS/spreadsheet tool, so it's
the safe default per §0.2's restrictive-interpretation rule. Adding an
XLSX branch later is additive (a second parser behind the same
`importRoster()` entry point), not a rewrite.

---

### D-025 — 2026-08-30 — Corrective migration: RESTART_AUTHORIZED added to the terminal-states list

**Decision:** A new migration
(`20260830120000_restart_authorized_terminal`) drops and recreates
`cases_one_nonterminal_per_student` (M01's partial unique index
enforcing "at most one non-terminal case per student") to add
`RESTART_AUTHORIZED` to the excluded (terminal) state list, alongside
`CLOSED_PASS`, `CLOSED_INCOMPLETE`, `WITHDRAWN`, `WAIVER_GRANTED`,
`WAIVER_DENIED`, `RESTART_DENIED`.

**Why:** Found while writing M04's transition table (BR-06). Row 20's
own postcondition — HoD authorizes a restart, a new case gets created in
`ELIGIBLE` for the same student — is impossible under M01's original
list, because a case sitting in `RESTART_AUTHORIZED` would still count
as "non-terminal" and the new case's insert would violate the unique
index. `RESTART_AUTHORIZED` is, functionally, a terminal state for *this
particular case* — the student's continued journey happens on a new
case row (`previous_case_id` links them), not by this one re-entering
the state machine. Caught by hand-tracing the transition table against
the M01 constraint before writing any code, not by a failing test.

---

### D-026 — 2026-08-30 — `TransitionContext` is one flat, optional-fields shape, not a discriminated union per transition

**Decision:** `TransitionContext` (src/server/state-machine/types.ts)
carries `caseId`, `actor`, `reason?`, and two optional narrow slices —
`grade?: {recommendedBy, awardedBy}` and `restart?: {...}` — rather than
21 per-transition context types.

**Why:** Only 2 of the 21 rows need extra context beyond the case id,
actor, and reason (BR-12's recommender/awarder check on rows 12-13;
G1/G2/G4/G5's restart-specific fields on rows 19-20). A discriminated
union keyed by `to` state would be more precise but would make the
executor's own signature depend on the full transition table shape,
which fights against `opts.table` being swappable (as the test suite's
`SYNTHETIC_TABLE` relies on). Every guard function only reads the slice
it needs and ignores the rest; guards for stubbed rules ignore `ctx`
entirely. Revisit if a future module's context need doesn't fit either
slice cleanly.

---

### D-027 — 2026-08-30 — Guard division of labor: BR-07/08/09/10/11 stubbed, restart guards (G1/G2/G4/G5) implemented for real

**Decision:** `src/server/state-machine/guards.ts` implements
`recommenderNotAwarder` (BR-12), `differentOrganization` (G1),
`timeRemains` (G2), `belowRestartCap` (G4), and `distinctSigners` (G5)
for real, evaluated against real `TransitionContext` fields. BR-07
(offer completeness), BR-08 (duration bounds), BR-09 (relevance), BR-10
(deliverables present), and BR-11 (deliverables verified) are
`stubGuard(ruleId)` — a `GuardFn` that always returns `{ ok: true }` but
carries `.ruleId` for later introspection/replacement.

**Why:** BR-07 through BR-11 each depend on data model and business
logic that belongs to other modules not yet built (M05 offers, M09
documents/deliverables, M10 company matching) — implementing them now
would mean guessing at those modules' shapes and almost certainly
redoing the work. The restart guards, by contrast, only need data M04
itself already has reason to define (company name on `cases`, semester
counts, a restart counter, signer ids) — deferring them would leave
BR-06's most safety-critical rule (the restart cap, and the
double-signature requirement) unenforced with no compensating control.
Each stub is a one-line, obviously-a-stub call, not a silent `return
true` buried in the guard list, so a future module can `grep` for
`stubGuard` and know exactly what's left.

---

### D-028 — 2026-08-30 — `stubGuard(ruleId)` returns a real `GuardFn`, not a bare closure

**Decision:** `stubGuard` takes a `ruleId: string` parameter and returns
a function with a `.ruleId` property attached, rather than a bare
`() => ({ ok: true })` closure repeated five times.

**Why:** A bare stub gives no way to tell, from the transition table
alone, *which* business rule a given stub is standing in for — M04.md's
table documents this in prose, but the code itself would go silent. The
attached `.ruleId` makes that traceable at runtime (useful for a future
audit or a test asserting "row 4 still carries its BR-08/BR-09 stubs")
without adding a discriminated stub-registry type. Also incidentally
avoids an ESLint unused-parameter warning that an underscore-prefixed
`_ruleId` would otherwise have needed.

---

### D-029 — 2026-08-30 — Offer-letter fields land on `cases`, not a dedicated `offers` table

**Decision:** `work_description` and `relevance_confirmed` are new
nullable columns directly on `cases` (migration
`20260830130000_offer_fields`). Company name/contact use the existing
`Company.name`/`Company.contact` (M01) — no new columns needed for those.

**Why:** M01 explicitly deferred this placement decision to M05 (see its
comment on `model Case`). An offer is 1:1 with its case at any given
moment — a rejection-then-resubmission overwrites the same fields, and
nothing in `MASTER_PROMPT.md` asks for a history of each submission
attempt's exact text, only a history of the state transitions, which
`case_events` already gives for free. A dedicated `offers` extension
table would only add a join for no real benefit at this module's scope.

---

### D-030 — 2026-08-30 — The offer letter file gets a minimal interim writer, not M06's real pipeline

**Decision:** `src/server/documents/store.ts` writes uploaded files
directly: MIME allowlist check, size cap, SHA-256 checksum, UUID storage
key, written to `UPLOAD_DIR` outside the web root, a `Document` row
created. It does **not** do magic-byte sniffing, a ClamAV scan, or
expose a download route.

**Why:** BR-07 requires "the offer letter file" to exist before a
submission is valid, but `MASTER_PROMPT.md` §7 puts the hardened upload
pipeline (sniffing, ClamAV, the authenticated streaming download route)
in M06, deliberately *after* M05. Waiting for M06 to build offer
submission at all would block this module on one not-yet-built later
module; guessing at M06's own internals to build them early would risk
redoing that work. The interim writer already produces the exact same
`Document` row shape M06 will scan and serve — M06 hardens the write
path in place and adds the read path, without this module's callers or
schema changing shape. Same pattern as M04's guard stubs (D-027): do
the part that's genuinely this module's job now, mark the boundary
explicitly, let the later module fill in the rest.

---

### D-031 — 2026-08-30 — BR-09's "mandatory field... with the reason stored" is one field, not two

**Decision:** Approval requires a boolean `relevanceConfirmed: true`
(the "mandatory field" BR-09 names) plus the already-mandatory approval
`reason` (M04's `requiresReason: true` on this row) — read as the "reason
stored" BR-09 also asks for. No second free-text "why is this relevant"
field was added.

**Why:** A dedicated relevance-reason field would duplicate the
already-mandatory approval reason for no stated benefit — BR-09 doesn't
say the relevance justification must be a *separate* piece of text from
the approval reason, only that a reason gets stored alongside the
judgement, which it does either way. Revisit if this reading turns out
wrong; a dedicated field is additive, not a rewrite.

---

### D-032 — 2026-08-30 — `openCase()` blocks re-opening from any terminal state except `WITHDRAWN`

**Decision:** Beyond BR-06's DB-level "at most one non-terminal case"
index, `src/server/offers/service.ts`'s `openCase()` also rejects
opening a new case while the student's most recent case is
`CLOSED_PASS`, `CLOSED_INCOMPLETE`, `RESTART_DENIED`, or
`RESTART_AUTHORIZED` — i.e. every state in M04's `TERMINAL_CASE_STATES`
list except `WITHDRAWN`.

**Why:** `CLOSED_INCOMPLETE`/`RESTART_DENIED`/`RESTART_AUTHORIZED` are
exactly the restart gate's (M10) territory — a plain re-open would let a
student route around dual sign-off and the restart cap entirely.
`CLOSED_PASS` has nothing left to do. `WITHDRAWN` is the one terminal
state read as a genuine dead end otherwise (a withdrawal happens before
approval and leaves no grade; `MASTER_PROMPT.md` §1.2 gives no
indication a withdrawn student can't try again), so it's the only one
excluded from the block list. `WAIVER_GRANTED`/`WAIVER_DENIED` are
included in the block list for the same reason `TERMINAL_CASE_STATES`
includes them — defence in depth against a state that's currently
unreachable (OQ-12) ever becoming reachable later.

---

### D-033 — 2026-08-30 — `ELIGIBILITY_PENDING → ELIGIBLE` gets its first real caller

**Decision:** `openCase()` creates the case in `ELIGIBILITY_PENDING`
(the schema default), computes eligibility via M03's
`computeEligibility()`, and only then calls `executeSystemTransition()`
with the result — rather than creating the case directly in `ELIGIBLE`
the way M03's BR-02 sweep does.

**Why:** OQ-11 flagged this transition as defined and tested but
uncalled, noting that wiring it up later would cost nothing beyond
adding a caller. This is that caller: BR-01 ("eligibility... never
self-declared") is now enforced by the same guarded, audited transition
path as every other state change, not a special-cased direct insert. If
the student isn't eligible, no case is created at all — a dangling
`ELIGIBILITY_PENDING` row with no path forward would be worse than no
row, since nothing in this build sweeps that state.

---

### D-034 — 2026-08-30 — Rows 3 and 7 chain automatically inside the same request

**Decision:** `submitOffer()` calls `executeTransition()` (→
`OFFER_SUBMITTED`) then immediately `executeSystemTransition()` (→
`OFFER_UNDER_REVIEW`) in sequence; `approveOffer()` does the same for
`APPROVED` → `IN_PROGRESS`. Both remain separate, independently audited
transitions — chaining is a caller-side convenience, not a change to how
the executor works.

**Why:** `MASTER_PROMPT.md`'s eight-step table lists "queued for review"
and "internship under way" as immediate consequences of submission and
approval, not scheduled events — unlike BR-02's semester-6 sweep, which
explicitly is time-driven. Nothing describes a meaningful waiting state
between either pair, so a scheduled sweep to advance them would add
latency and complexity for no described benefit.

---

### D-035 — 2026-08-30 — Test-fixture semester ranges: low, disjoint, ordered blocks — not random ones

**Decision:** `tests/integration/support/offer-fixtures.ts`'s
`createEligibleStudent()` takes a required `startSequence` parameter;
every caller reserves its own small hardcoded block (1000, 1500, 2000,
2500, 3000, 3500, 4000 across M05's test files), all below BR01's 5000s,
BR02's 10000-40000s and M03's 50000-80000s. `createClosedSemesterChain()`
(shared, M01/M03) was also changed to derive each semester's `year` from
`startSequence` instead of leaving it to `createSemesterFixture()`'s own
random default.

**Why:** Two real bugs, both found by running the full suite fresh
rather than trusting an in-isolation pass. First: `computeEligibility()`
counts *every* CLOSED semester in the database at or above a student's
admission `sequenceNumber` — BR02's sweep and the real eligibility route
both call it that way (`prisma.semester.findMany()`, unfiltered). This
fixture's first draft picked a large random `sequenceNumber` range
(300M-900M) specifically to avoid the column's UNIQUE-constraint
collision other fixtures worry about — which put it *above* every real
admission point in the suite, silently inflating BR02_auto_enrollment_
sweep's and M03_eligibility_route_ownership's counts whenever this
fixture's file happened to run first alphabetically. Fixed by extending
the existing "each file owns a disjoint, ordered low block" convention
those two files already use, one block lower, instead of one large block
stacked on top. Second: `createSemesterFixture()` defaults `type` to
`FALL` and `year` to a random value in a 100,000-wide space — creating
several dozen chains (as M05's fixtures now do) gives a real
birthday-paradox chance of two `FALL` semesters landing on the same
year, which happened once while building this module. Deriving `year`
from the already-uniqueness-guaranteed `startSequence` fixes it without
touching `createSemesterFixture()`'s own default (other, lower-volume
callers still get one).

---

### D-036 — 2026-08-30 — Hand-rolled clamd INSTREAM client, no npm dependency

**Decision:** `src/server/documents/clamav.ts`/`clamav-protocol.ts`
implement clamd's INSTREAM wire protocol directly over `node:net`, split
into a pure byte-framing half (unit-testable, no socket) and a thin
I/O half.

**Why:** The project's dependency list (`package.json`) is deliberately
lean — every existing dependency has one clear job, no general-purpose
grab-bag utility libraries. The INSTREAM protocol itself is small (a
command string, length-prefixed chunks, a one-line response to parse) —
implementing it directly avoids taking on an unfamiliar third-party
package's maintenance status, API stability, and transitive dependencies
for what's genuinely about 80 lines of protocol logic. Consistent with
the same reasoning behind the argon2/nodemailer/pg choices already in
the dependency list: each solves one narrow problem this codebase
actually has, nothing broader.

---

### D-037 — 2026-08-30 — Magic-byte sniffing is hand-written, scoped to exactly the three allowed types

**Decision:** `src/server/documents/magic-bytes.ts` checks byte
signatures for `application/pdf`/`image/jpeg`/`image/png` only, rather
than adding a general file-type-sniffing library.

**Why:** `ALLOWED_MIME` (`.env.example`) only ever configures these
three types — a general sniffing library would detect dozens of formats
this system will never accept, at the cost of a dependency whose ESM/
CJS interop has historically been troublesome in some popular packages
of this kind. Three signature checks is a small, stable, fully
own-code surface that changes only if `ALLOWED_MIME`'s policy itself
changes.

---

### D-038 — 2026-08-30 — ClamAV is mocked in the fast test suite, proven for real only via `docker compose`

**Decision:** `tests/integration/setup.ts` mocks
`@/server/documents/clamav`'s `scanBuffer()` to report clean by default
(via `vi.mock(..., importOriginal)`, keeping the real error classes so
`instanceof` checks and per-test override still work). The real clamd
protocol is exercised only during this module's `docker compose`
verification, against the compose stack's real `clamav` service,
including a genuine EICAR test-string positive.

**Why:** Same boundary M02 already drew around `sendMail()` — this
project's fast dev-loop test containers (temp Postgres/Redis) don't
include a real ClamAV instance, and its virus-database load takes
minutes on first boot per the compose healthcheck's own
`start_period: 180s`, which is a real cost worth avoiding on every
`pnpm test:integration` run. The mock only ever needs to answer "clean"
or "throw"; the actual scanning correctness (does clamd really detect a
real threat) is a property of ClamAV itself, not of this application's
code, so proving it once against the real service is enough — repeating
it on every fast test run wouldn't catch a different class of bug.

---

### D-039 — 2026-08-30 — Uploads fail closed if the virus scan can't be completed

**Decision:** `scanBuffer()` throws `ScanUnavailableError` (rather than
resolving to a boolean the caller could accidentally treat as "clean")
whenever the `clamav` service is unreachable, times out, or returns a
malformed response. `storeDocument()` has no code path that accepts a
file without a scan actually completing.

**Why:** `MASTER_PROMPT.md` §9 states files are "scanned by ClamAV" as
a factual property of the system, not a best-effort nicety — treating
scanner-unavailable as "allow it through" would make that statement
false exactly when it matters most (an outage). Failing closed means an
outage blocks uploads (a visible, debuggable failure) rather than
silently admitting unscanned files (an invisible, dangerous one).

---

### D-040 — 2026-08-30 — Document supersede-on-reupload applies uniformly per `(caseId, type)`

**Decision:** `storeDocument()` marks every existing `ACTIVE` document
of the same `(caseId, type)` `SUPERSEDED` before inserting the new row,
for all three `DocumentType` values — not just `OFFER_LETTER`/
`COMPLETION_CERTIFICATE`.

**Why:** M05's interim writer never did this at all, leaving two
`ACTIVE` `OFFER_LETTER` rows behind after a resubmission — a real gap
this module closes. `SUPPORTING_EVIDENCE`'s eventual semantics (the
restart gate, M10, not built yet) are genuinely unknown; it might want
multiple concurrent active attachments rather than "latest replaces
prior." Applying the uniform rule now is the restrictive default (fewer
concurrently-current documents, not more) — narrowing the `where`
clause to skip `SUPPORTING_EVIDENCE` later, if M10 needs that, is a
small additive change, not a rewrite.

---

### D-041 — 2026-08-30 — Download route reuses `case.view_own`/`case.view_any`; no new capability

**Decision:** `GET /api/documents/:id/download` authorizes with the
same two capabilities the case routes already use, rather than adding a
`document.download` (or similar) row to `src/server/authz/matrix.ts`.

**Why:** `MASTER_PROMPT.md` §3's eighteen-row capability table has no
"download document" entry — §2.1's prose lists it as something a
Student can do, but it isn't one of the table's enumerated permissions.
Reusing "can this identity see this case" for "can this identity
download this case's document" is the restrictive, spec-literal
reading: no new authority surface was invented beyond what §3 actually
enumerates.

---

### D-042 — 2026-08-30 — BR-10's guard stays stubbed; M06 only wires two of its three legs

**Decision:** Row 9 (`DOCS_PENDING → PENDING_VERIFICATION`) keeps
`stubGuard("BR-10")` unchanged. M06 adds the completion-certificate
upload route (so a real `COMPLETION_CERTIFICATE` `Document` row can
exist alongside the `OFFER_LETTER` one M05 already produces), but
doesn't attempt a partially-real guard.

**Why:** BR-10 needs all three deliverables — offer letter, completion
certificate, *and* supervisor evaluation. The third has no data model
yet (`DocumentType` has no supervisor-evaluation variant, and M08's
tokenised form submission almost certainly won't be a `Document` row
the way file uploads are). A guard reading two real legs plus one that
no code path can ever supply `true` for would make row 9 permanently
unreachable in practice — its own "success path" test would have to
fake the missing leg, which isn't meaningfully different from the stub
it would be replacing. Left fully stubbed until M08 exists to supply
the third leg for real; the stub's comment now names both M08 and M09.

---

### D-043 — 2026-08-30 — Progress log entries are a new table, immutable, one per `(case, week)`

**Decision:** `ProgressLogEntry` (migration `20260830140000_progress_log`)
is a new table, `UNIQUE (case_id, week_number)`, never updated or
deleted once written.

**Why:** `MASTER_PROMPT.md` describes "student-side progress log, weeks
completed, mid-point check-in" without a `BR-` ID or a field-level
shape, unlike BR-07/08/09's precise lists. One row per week mirrors the
Google Sheet this module replaces; immutability matches the same
append-only default this codebase already applies to `case_events`/
`audit_events`/`documents` — a correction is a new later entry, not a
rewrite of history.

---

### D-044 — 2026-08-30 — "Weeks completed" and "mid-point reached" are both computed, never stored

**Decision:** `weeksCompleted` is `COUNT(entries)` (not the highest
`weekNumber` logged), and `hasReachedMidpoint` is derived from whether
any logged entry's `weekNumber` is at or past
`ceil(plannedWeeks / 2)` — neither is a column anywhere.

**Why:** A `MAX(weekNumber)` count would overstate progress if a
student skipped a week (logged week 1 then week 3) — counting rows is
the literal "how many weekly updates actually happened." Deriving the
midpoint from the real log, the same way BR-01's eligibility is
computed from the roster rather than self-declared, means it can never
drift from what was actually logged the way a separately-set checkbox
could.

---

### D-045 — 2026-08-30 — Actual dates are recorded at the same action that fires `IN_PROGRESS -> DOCS_PENDING`

**Decision:** `completeInternship()` writes `cases.actual_start`/
`actual_end` and calls the real executor for row 8 in one function,
behind one route (`POST /api/cases/:id/complete-internship`). Row 8's
guard (previously empty) is now `actualDatesRecorded` — presence and
`end > start` sanity only, deliberately **not** the 4-8-week bound
`durationWithinBounds` enforces on *planned* dates.

**Why:** BR-08: "the system records planned dates at approval and
actual dates at completion" — "completion" reads as the same moment the
student finishes and moves to document submission, i.e. row 8 itself,
not a separate step. Not enforcing the week-bound on actual dates is
deliberate: BR-08 also says the system "flags any variance for the
Focal Person," which only makes sense if an out-of-bounds actual
duration is allowed to happen and get flagged, not silently blocked at
the door.

---

### D-046 — 2026-08-30 — Vitest's default file sequencer is wrong for this suite; pinned to alphabetical order

**Decision:** `vitest.integration.config.ts` sets a custom
`sequence.sequencer` (`vitest.integration.sequencer.ts`, kept at the
project root rather than under `tests/` — see its own doc comment for
why) that sorts test files by plain filename instead of Vitest's
default duration-based heuristic.

**Why:** Found for real while building M07: `fileParallelism: false`
(this config) exists because these integration tests share one live
database with no per-test isolation, and this suite's own fixture files
have — since M03 — relied on and documented a "each file reserves a
disjoint numeric block, low blocks run before high ones" convention
that only holds if files actually *execute* in a stable, predictable
order. Vitest's default `BaseSequencer` orders by cached test duration
(for shard-balancing), which is neither alphabetical nor stable across
runs — confirmed by reproducing a real failure where
`M03_semester_open_close_exclusivity.test.ts` ran *before*
`M03_eligibility_route_ownership.test.ts` despite sorting the other way
alphabetically, silently inflating the latter's semester count. Pinning
to filename order makes the suite's existing ordering comments actually
true, deterministically, on every run — not just on the runs where the
duration cache happened to cooperate.

---

### D-047 — 2026-08-30 — Two more latent test-fixture pollution sources closed while building M07

**Decision:** `M03_semester_open_close_exclusivity.test.ts`'s semesters
now use explicit low `sequenceNumber`s (90000-90004) instead of
`createSemesterFixture()`'s random default; `createClosedSemesterChain()`
's derived `year` offset (D-035's fix, M05) was widened from `2000 +
startSequence` to `1,000,000 + startSequence` after the smaller offset
collided with `BR01_eligibility_is_computed_not_stored.test.ts`'s own
hand-picked `5100 + random(0, 1000)` year range.

**Why:** Both are the same class of bug D-035 already named: a test
that creates a `CLOSED` semester with an uncontrolled or too-narrow
number silently pollutes another test's `computeEligibility()`-based
count, or collides on the `(type, year)` unique constraint. D-046's
sequencer fix addresses the *ordering* half of this risk at the root;
these two are the remaining *magnitude*/*range* half — a low-but-
uncontrolled sequenceNumber, and a derived-year offset that turned out
not to be as clear of every hand-written range elsewhere in the suite
as first thought. `M03_semester_admin_routes.test.ts` has the same
shape of risk but can't be fixed the same way (its semester's
`sequenceNumber` comes from production's own `nextSequenceNumber()` via
the real route, not a fixture parameter) — left as a documented residual
risk, bounded by D-046's ordering fix, in that file's own comment.

---

### D-048 — 2026-08-30 — `require-capability-lint-rule.test.ts`'s timeout raised to 20s

**Decision:** Each `it()` in this file (which invokes ESLint's Node API,
including type-aware parsing via `typescript-eslint`, against the real
project) now passes an explicit `20_000`ms timeout, up from Vitest's
5000ms default.

**Why:** A cold `new ESLint()` instantiation plus its first type-aware
lint pass scales with the size of the project it's configured against —
this repository has grown by dozens of files across M05/M06/M07, and
the first test in this file started intermittently exceeding 5 seconds
on ordinary hardware. Not a logic bug in the rule itself (the assertions
are unchanged); a timing budget that no longer matched real project
size.

---

### D-049 — 2026-08-30 — `users.full_name`: a real, previously-undiscovered schema gap

**Decision:** Added `User.fullName String?` (nullable, not backfilled),
and made `src/server/roster/csv-import.ts` accept an optional `fullName`
CSV column going forward.

**Why:** `MASTER_PROMPT.md` §2.5 requires the public supervisor
evaluation page to show "the student name" — no field anywhere in the
schema stored one; `User` only ever had `email`, `Student` only
`registrationNumber`/`programme`. Nothing before M08 needed to display a
human name. Nullable rather than a blocking backfill: existing test
fixtures and any student imported before this column existed would
otherwise need a rewrite outside this module's scope. The public page
falls back to `registrationNumber` when `fullName` is unset, so it never
renders broken, just less friendly. Landed on `User`, not `Student`,
since a display name isn't conceptually student-specific — a future
module could reasonably want the same field for Focal/HoD/Dean.

---

### D-050 — 2026-08-30 — Supervisor token: HMAC-signed raw value, SHA-256 hash stored

**Decision:** `generateRawSupervisorToken()` returns `HMAC-SHA256
(SESSION_SECRET, randomBytes(32))` as the raw token; `hashSupervisorToken()`
(`SHA-256` of the raw token) is the only thing persisted.

**Why:** `MASTER_PROMPT.md` §9 states supervisor tokens are "HMAC-signed
... and stored hashed" — read as two separate properties, not one fact
stated twice. `issuePasswordResetToken()` (M02) already established
"only the hash is stored" for a structurally similar one-time link, but
that token was bare random bytes; this one adds the HMAC layer on top
because the master prompt asks for it here specifically. The practical
security delta over bare `randomBytes(32)` is small given `node:crypto`'s
CSPRNG is not the weak link in this design — but the master prompt names
the property explicitly for this token and not for password reset, so
it's honored literally rather than treated as redundant.

---

### D-051 — 2026-08-30 — The supervisor's email is a route parameter, not read from `Company.contact`

**Decision:** `POST /api/cases/:id/supervisor-token` requires
`supervisorEmail` in the request body; nothing reads `Company.contact`
(M05) to infer it.

**Why:** `Company.contact` is free text captured at offer-submission
time by the *student*, for a different purpose (the company's general
contact), and was never validated as an email address — M05's zod
schema only required `.min(1)`. Treating it as "the supervisor's email"
here would be guessing both its format and that it's the right person.
The Focal Person, who is the one deciding to issue a token, supplies the
address explicitly; `SupervisorToken.supervisorEmail` (new column)
records it for audit and so a later replacement doesn't need to guess it
either.

---

### D-052 — 2026-08-30 — BR-28: M08 builds detection, M12 builds delivery

**Decision:** `classifyTokenForReminder()` (pure, given a token's age
against `SUPERVISOR_SLA_DAYS` and its `reminderCount`, returns none/
first-reminder-due/second-reminder-due/escalate) and `recordReminderSent()`
(bumps `reminderCount`/`lastReminderSentAt`) are real and tested. No
BullMQ job, no actual reminder email, and no automatic "flag the case
for Focal Person intervention" action exist yet.

**Why:** `MASTER_PROMPT.md` §7 gives M12 "BullMQ jobs for reminders...
the BR-28 supervisor escalation... email templates... versioned... no
ad-hoc strings in services" as its own explicit deliverables — a direct
overlap with M08's own one-line summary. Building a real scheduled job
and a second, throwaway email-templating scheme here would either
duplicate M12's future infrastructure or invent a version of it that
doesn't meet "templated and versioned." Same division-of-labour pattern
as M04 leaving BR-07/08/09/10/11 as named stubs for M05/M06/M09 to
replace, and M06 leaving BR-10's third leg to M08: build the part that's
genuinely this module's job, name the boundary explicitly, leave the
rest to the module that actually owns it.

---

### D-053 — 2026-08-30 — Evaluation visibility: a config flag read at the route boundary

**Decision:** `SHOW_EVALUATION_TO_STUDENT` (default `false`, new env
var) gates `GET /api/cases/:id/evaluation` for a Student caller; Focal/
HoD are never gated by it. Checked directly in the route, not modeled
as a capability.

**Why:** `MASTER_PROMPT.md` §9 "Privacy" states this exact requirement,
including the default: "Evaluation comments are visible to Focal Person
and HoD only, never to the student, unless the department later decides
otherwise (make this a config flag, defaulted to hidden)." A capability
would be the wrong shape — capabilities in this codebase answer "can
this role ever do X," not "can this role do X only when a runtime
setting says so" — matching how `document.upload_completion_certificate`
and `case.progress_log_update` stayed simple, unconditional STUDENT
capabilities while their *routes* carry the state/ownership gating.

---

### D-054 — 2026-08-30 — The supervisor evaluation's "verification" is its own token, not a `Verification` row

**Decision:** BR-10's "all three deliverables exist" checks the
`Evaluation` row's existence directly. BR-11's "all deliverables
verified" only ever requires `Verification` rows for the two
`Document`-backed deliverables (offer letter, completion certificate) —
the evaluation never gets one.

**Why:** `Verification.documentId` (M01) is a foreign key to `Document`
— structurally, only `Document`-backed deliverables can ever have a
`Verification` row at all. BR-11's fixed method list includes
`SUPERVISOR_LINK_CONFIRMED`, which reads as *a way to verify a document*
(e.g. corroborating the completion certificate against the supervisor's
own evaluation) rather than a claim that the evaluation itself needs a
second, separate verification step. The evaluation's authenticity is
already stronger than a manual checkbox: an HMAC-signed, single-use
token (M08) is harder to fake than clicking "verified."

---

### D-055 — 2026-08-30 — `recommendedGradeValue`/`recommendedBy` land on `Case`

**Decision:** Two new nullable columns on `cases` hold the Focal
Person's grade recommendation between row 11 (`GRADE_RECOMMENDED`) and
rows 12/13 (award) — not a new `GradeRecommendation` table.

**Why:** `Grade` (M01) requires `recommendedBy` *and* `awardedBy`
simultaneously (both non-nullable) — it can only be created once,
atomically, at award time, so there's nowhere on that table to park
"what was recommended" while the case waits on the HoD. Mirrors M05's
`workDescription`/`relevanceConfirmed` and M07's `actualStart`/
`actualEnd` — this schema's established pattern for "state captured
mid-flow, consumed by a later step" — rather than a new table nothing
else would ever need to query as its own resource.

---

### D-056 — 2026-08-30 — The HoD's award can differ from the Focal Person's recommendation

**Decision:** `awardGrade()` accepts its own `value`; it never silently
copies `Case.recommendedGradeValue`. The transition target (`CLOSED_PASS`
vs. `CLOSED_INCOMPLETE`) follows whatever the HoD actually chooses.

**Why:** "The Focal Person recommends; the HoD awards" (BR-12) reads as
two independent judgements — MASTER_PROMPT.md's own phrasing for the
HoD's role is "approve or reject the Focal Person's grade recommendation
(this is the act that awards the grade)," which implies a real decision
point, not a rubber stamp forced to match. A disagreement is exactly
what "approve or reject" as a description already anticipates.

---

### D-057 — 2026-08-30 — Grade creation happens *after* the transition succeeds, not before

**Decision:** `awardGrade()` calls `executeTransition()` first; only on
success does it create the `Grade` row.

**Why:** A first draft did this the other way around and had a real
bug: `grades.case_id` is unique, so if the `Grade` row were created
*before* the transition and the transition then failed (wrong actor,
missing reason, or the `recommenderNotAwarder` guard rejecting a
same-account award attempt), the case would be left with an orphaned
`Grade` row and no way to retry — the unique constraint would reject
every subsequent attempt, even a legitimate one from a different
account. Caught by tracing the failure path before writing a test for
it, not by a failing test. `docker compose`-verified directly: a
same-account award attempt is rejected and leaves zero `Grade` rows
behind, confirmed against the real database.

---

### D-058 — 2026-08-30 — `grade.reverse`: a nineteenth capability, a real gap in §3's table

**Decision:** Added `grade.reverse` (DEAN) to `src/server/authz/matrix.ts`
— not one of `MASTER_PROMPT.md` §3's eighteen rows.

**Why:** BR-14 requires "a Dean signature" for a grade reversal, but no
row in the capability table covers it, and none of the Dean's other
capabilities (`escalation.rule_restart`, `waiver.approve_final`) are a
defensible stand-in for it — reusing either would be authorizing a
distinct action under a capability that describes something else. Same
situation M06 (downloads) and M08 (evaluation visibility) hit, but
unlike those two, no existing capability fit here at all, so a new one
was the only honest option.

---

### D-059 — 2026-08-30 — A grade reversal never touches `cases.state`

**Decision:** `reverseGrade()` only ever creates a `GradeReversal` row.
It never calls the transition executor, and no transition exists
anywhere in M04's table that leaves `CLOSED_PASS`/`CLOSED_INCOMPLETE`.

**Why:** BR-15 is explicit: "`CLOSED_PASS` can never be reopened by any
role in this system." A `GradeReversal` is read as a permanent,
additive correction to the *record* — the grade's real-world validity is
now disputed, visible forever alongside the original — not a re-opening
of the case for a new outcome. If a student genuinely needs another
attempt, that's the restart gate's job (M10), a structurally separate
mechanism already gated on `CLOSED_INCOMPLETE` specifically, not
triggered by a reversal of any kind.

---

### D-060 — 2026-08-30 — `grade_reversals` gets the same append-only privilege treatment as `grades`

**Decision:** This module's migration adds
`REVOKE UPDATE, DELETE ON "grade_reversals" FROM scit_app`.

**Why:** A real, minor gap found while implementing BR-14: M01 revoked
`UPDATE`/`DELETE` on `grades` itself but never extended the same
treatment to `grade_reversals` — the correction record BR-14's own
integrity depends on. A reversal record that could itself be silently
edited or deleted after the fact would undercut the audit trail it
exists to provide, the same reasoning that made `grades` append-only in
the first place.

---

### D-061 — 2026-08-30 — Row 9's auto-chain is triggered from M06's and M08's own routes

**Decision:** `advanceToVerificationIfReady()` is called at the end of
`POST /api/cases/:id/completion-certificate` (M06) and
`POST /api/supervisor/evaluate/:token` (M08) — whichever of the two
delivers the third deliverable last is the one that actually fires row
9. It swallows `IllegalTransitionError` (not ready yet, or a concurrent
path already advanced the case) and re-raises anything else.

**Why:** Both routes already exist, already know the case they just
touched, and are the only two places BR-10's remaining legs can ever
arrive from (the offer letter, the third possible trigger, is already
guaranteed present by the time a case reaches `DOCS_PENDING` at all —
M05 requires it for `OFFER_SUBMITTED`). A dedicated sweep job would
mean polling for a condition that only two code paths can ever cause to
become true, and reaching back into two already-shipped, already-tested
modules to wire a one-line call each is a smaller, more targeted change
than a new scheduled job — the same reasoning M05 used for auto-chaining
rows 3 and 7 in the first place.

---

### D-062 — 2026-08-30 — G1's registration-number/fuzzy-match half lands in M10, extending an M04 guard plus a new service-level layer

**Decision:** `differentOrganization` (M04) gains a second hard-block
check — an exact `Company.registrationNumber` match, when both sides
have one on file — alongside its existing exact-name check. The *fuzzy*
half (similarity above `COMPANY_MATCH_THRESHOLD`, flagged for an
explicit HoD override) isn't a guard at all: it's computed in
`src/server/companies/match.ts` (new, dependency-free Levenshtein-ratio
similarity) and enforced in the countersign route, which 400s a flagged
request unless the HoD explicitly passes `acknowledgeFlaggedMatch: true`.

**Why:** `differentOrganization`'s own doc comment already earmarked
this exact split for M10 ("fuzzy matching... with human confirmation on
a flagged match is M10's job"). A guard is a pure, single-shot
pass/fail; "flagged, pending an explicit override supplied on a *later*
request" needs state and a second actor's input, which a guard function
can't express. See docs/modules/M10.md "Scope decisions."

---

### D-063 — 2026-08-30 — BR-20's "remains CLOSED_INCOMPLETE forever" is about history, not the live `state` column

**Decision:** No code change — this corrects a wrong assumption caught
in this module's own tests before it shipped. The failed case's
`cases.state` ends at `RESTART_AUTHORIZED` once the gate completes
(M04's own transition table already walks it there:
`CLOSED_INCOMPLETE -> RESTART_REQUESTED -> RESTART_AUTHORIZED`, and
`RESTART_AUTHORIZED` is one of `TERMINAL_CASE_STATES`), not literally
`CLOSED_INCOMPLETE`.

**Why:** §5.3's pseudocode is unambiguous about the failed case's own
walk through both edges before "the system" creates a separate new case
— it's the more mechanically precise source next to BR-20's looser prose
summary. "Remains `CLOSED_INCOMPLETE` forever" reads as being about
history — `case_events`' append-only trail still shows it passed through
`CLOSED_INCOMPLETE`, and nothing ever rewrites that — not about the
column's final value. A first draft of this module's own integration
test asserted the literal (wrong) reading; caught before merge by
tracing M04's actual transition table rather than trusting the prose in
isolation.

---

### D-064 — 2026-08-30 — A new, real test-fixture bug: `computeEligibility()`'s upper bound is the first thing in this suite to actually need an exact semester count, and it broke on both sides of every existing convention

**Decision:** M10's integration tests reserve their own block —
41000-41999 — sitting strictly between `BR02_auto_enrollment_sweep
.test.ts`'s ceiling (40_004) and `M03_eligibility_route_ownership
.test.ts`'s floor (50_000). Documented at the top of
`BR17_restart_guards.test.ts`.

**Why:** A real, previously-invisible bug in the established "low block"
convention: every module before M10 only ever checked
`isEligible`/`isPastAutoEnrollBoundary`, one-directional booleans immune
to over-counting — extra CLOSED semesters above the threshold never flip
them false, so no one ever noticed that `computeEligibility()`'s "every
CLOSED semester at or above admission, DB-wide" counting (the real,
intended BR-01/BR-02 semantics, not a test artifact) silently inflates
*any* lower admission point by *any* higher block created anywhere in
the same run. G2 (semesters *remaining*) is the first check in this
build that's upper-bounded — inflation actually flips its answer. First
attempt used a "low" block (7000s, below the 10k-40k tier BR02 already
owns) and was inflated by BR02's own semesters (already in the database,
since `BR02_auto_enrollment_sweep.test.ts` sorts before this file
alphabetically). Second attempt used a very high block (2,000,000+, safe
from that) and broke `M03_eligibility_route_ownership.test.ts`'s own
exact-count assertion instead, in the opposite direction — this file
sorts *before* M03's, so its semesters already exist in the database by
the time M03's test runs, inflating *it*. The 41000-49999 gap is the one
window safe from both existing neighbours; nothing else in the suite
currently claims it. This is a structural limitation of sharing one
un-reset database across a whole test run, not something fixable in
`computeEligibility()` itself (its DB-wide counting is the correct,
intended production behaviour) — future modules adding another
upper-bounded check need to find their own gap the same way, or this
whole scheme needs a rethink (per-test transactional rollback) if gaps
run out.

---

### D-065 — 2026-08-30 — `escalations` gets the same append-only privilege hardening M09 gave `grade_reversals`

**Decision:** This module's migration adds
`REVOKE UPDATE, DELETE ON "escalations" FROM scit_app`.

**Why:** The same real gap, same shape as D-060: M01 revoked
`UPDATE`/`DELETE` on `audit_events`/`case_events`/`grades` but never on
`escalations`, despite `Escalation`'s own doc comment already claiming
finality ("no further transition anywhere in the system reads or
updates an escalation row once written"). BR-18 calls the Dean's ruling
"final" — a row that could be silently edited afterward would undercut
that.

---

### D-066 — 2026-08-30 — A hard guard failure at restart-request time still creates a `RestartRequest` row, `outcome: DENIED`

**Decision:** `requestRestart()` always produces a `RestartRequest`
row — `PENDING` if the transition succeeds, `DENIED` (with the failing
guards recorded in `g1Result`/`g2Result`) if G1/G2/G4 rejects it outright
before the case ever reaches `RESTART_REQUESTED`.

**Why:** M04's transition table gates G1 (exact match)/G2/G4 directly on
the first edge — a guard failure there means the case never moves at
all, so it can never later be walked to `RESTART_DENIED` by the HoD-deny
transition. But BR-19 says exceeding the cap's "only remaining route is
a Dean-level ruling," which requires *something* escalatable to exist
even when the case itself never left `CLOSED_INCOMPLETE`. Reading "the
request" (BR-18) as the `RestartRequest` row rather than `cases.state`
resolves this: every attempt, whichever guard rejects it and whenever,
produces exactly one row endeding in `DENIED`, and that row — not the
case — is what `escalate` operates on. See docs/modules/M10.md "Scope
decisions" for the full reasoning, including why G5 (distinct signers)
is deliberately *not* treated the same way.

---

### D-067 — 2026-08-30 — The new linked case starts at `ELIGIBLE` with `company_id` null, not pre-filled with the restart's vetted company

**Decision:** `countersignRestart()`'s new `Case` row carries only
`studentId`, `state: "ELIGIBLE"`, and `previousCaseId` — never
`companyId`, even though the new company was already identified and
vetted by G1.

**Why:** §5.3's pseudocode only specifies `previous_case_id` on the new
case. Pre-filling `companyId` would let a restart skip BR-07/BR-09's
offer-submission and relevance-approval steps for the new placement —
G1 only confirmed the company *differs* from the failed one, not that
it's an approved placement. The student still submits a real offer
through the ordinary M05 path, keeping case genesis uniform regardless
of how a case came to exist. The more restrictive reading: skips no
business rule.

---

### D-068 — 2026-08-30 — OQ-12 resolved: a waiver genesis-inserts a real `Case` and drives it through four new transition rows

**Decision:** `initiateWaiver()` creates a `Case` row directly in
`WAIVER_REQUESTED` (same genesis-insert pattern as BR-02's sweep and
M10's restart). Four new rows join M04's transition table:
`WAIVER_REQUESTED -> WAIVER_COUNTERSIGNED`/`WAIVER_DENIED` (HOD),
`WAIVER_COUNTERSIGNED -> WAIVER_GRANTED`/`WAIVER_DENIED` (DEAN). No
guards on any of the four — BR-22 is enforced at genesis-insert time,
BR-23 is an unconditional unique constraint, and sequencing (Dean only
reachable from `WAIVER_COUNTERSIGNED`, never `WAIVER_REQUESTED`
directly) is what makes all three signatures mandatory.

**Why:** M04 (2026-08-30, same day, earlier session) applied the
restrictive default the other way — waiver entirely independent of any
`Case` row — because nothing forced an answer then. Building this
module surfaced three pieces of pre-existing evidence that settle it:
M01's own `cases_one_nonterminal_per_student` index already excludes
`WAIVER_GRANTED`/`WAIVER_DENIED` from "non-terminal," M04's own
`TERMINAL_CASE_STATES` already lists both as dead code anticipating
real rows, and `Document.caseId` being `NOT NULL` means BR-22's
"attach supporting documentation" needed a real case to attach to
regardless. This isn't guessing past an open question — it's reading
what the schema and M04's own types already committed to and
completing it consistently. See docs/modules/M11.md "Resolving OQ-12."

---

### D-069 — 2026-08-30 — A failed evidence upload deletes the just-created genesis `Case`, the one place in this codebase a `Case` row is ever deleted

**Decision:** `initiateWaiver()` creates the `Case` row, then calls
`storeDocument()`. If that throws (bad file type, infected, oversized —
routine failure modes), the `Case` row is deleted before the error
propagates, and the `Waiver` row is never created.

**Why:** `Document.caseId` is required, so the `Case` must exist before
`storeDocument()` can run — there's no way to validate the file first.
But `waivers.student_id` is uniquely constrained, so if the `Case` were
left behind after a failed upload, every future attempt for that
student would find "already has a waiver's case" with no way to
retry — the exact class of bug M09's `awardGrade()` ordering fix
caught (D-057), one step earlier in the pipeline. Deleting a genesis
`Case` row is otherwise unprecedented — every other module only ever
transitions, never deletes — but safe here specifically because this
row never passed through the transition executor (no `CaseEvent`, no
trigger-guarded write) and nothing else can reference it yet, since the
`Waiver` row itself is only created after the document succeeds.

---

### D-070 — 2026-08-30 — `case.view_any` covers BR-24's waiver-visibility list; no new `waiver.view` capability

**Decision:** `GET /api/waivers` requires `case.view_any` (FOCAL/HOD/
DEAN), not a new capability.

**Why:** Unlike M09's `grade.reverse` and M10's `escalation.rule_restart`
(genuine gaps — no existing capability covered a distinct action the
master prompt's own table never named), this isn't a gap: `case.view_any`
already means exactly "FOCAL/HOD/DEAN can view any case," and a waiver
is now a real `Case` row (D-068). Reusing an existing capability that
already fits, not inventing a twentieth one.

---

### D-071 — 2026-08-31 — One integration point for "every status change": a hook in `executeTransition()`, not six edited service files

**Decision:** `executeTransition()` (M04) enqueues a `case-notifications`
job at the end of every successful transition, carrying the just-created
`CaseEvent`'s id and the row's own `emitsEvent`. Genesis inserts (BR-02's
sweep, M10's restart, M11's waiver) don't go through it — M11's waiver
gets one explicit, targeted notification call instead (`initiateWaiver()`
now calls `notifyWaiverInitiated()`); the others don't need one (see
docs/modules/M12.md "Scope decisions").

**Why:** Every one of M05 through M11's transitions already flows
through this one function — it's the only code path in the system
permitted to write `cases.state` at all (BR-25). Editing six already-
shipped, already-tested service files to each add their own notification
call after their own `executeTransition()` calls would mean six chances
to miss one, or to introduce a regression in code that's already proven
correct, for a change that's fundamentally the same one line each time.

---

### D-072 — 2026-08-31 — Notification delivery is decoupled from the request cycle; a failed send is `FAILED`, never automatically retried

**Decision:** The executor hook only enqueues (best-effort, swallowed on
failure — a Redis hiccup must never make a legitimate, already-committed
state change look like it failed). A BullMQ worker does the actual send.
`Notification.status` goes `QUEUED` → `SENT`/`FAILED` after exactly one
`sendMail()` attempt — no BullMQ `attempts` retry configured.

**Why:** A slow or down SMTP relay must never stall an approve-offer/
award-grade/etc. API call — that's what makes enqueue-then-deliver worth
the extra moving part. Once delivery is already async, a stale
notification retried hours later (after the underlying case may have
moved on again) isn't obviously better than a visible `FAILED` row —
and automatic retry would either duplicate a `Notification` row per
attempt (breaking BR-27/28's "was this already sent" dedup, which reads
this exact table) or need extra bookkeeping for no clear benefit this
module's done-criterion asks for.

---

### D-073 — 2026-08-31 — Role-targeted notifications go to every current holder of the role, not a per-case assignment

**Decision:** `usersWithRole()` resolves every `FOCAL`/`HOD`/`DEAN`
notification target — there is no "assigned Focal Person" (or HoD, or
Dean) on any `Case` anywhere in this schema.

**Why:** The whole authority matrix (MASTER_PROMPT.md §2/§3) is
role-based, not assignment-based — `requireCapability()` never checks
"is this the right Focal Person for this case," only "does this user
hold the FOCAL role." A notification system built on a per-case
assignment this build doesn't have would be inventing structure, not
following it. For one Focal Person this is invisible; for a larger
department it means everyone holding the role sees everything, the
safer default.

---

### D-074 — 2026-08-31 — BR-27's SLA clock runs only in `OFFER_UNDER_REVIEW` and `PENDING_VERIFICATION`

**Decision:** `runFocalSlaSweep()` only ever considers these two states.

**Why:** Every other state a case can be in is either not Focal-pending
at all (`ELIGIBLE`, `OFFER_REJECTED` — waiting on the student) or
transient by construction: `OFFER_SUBMITTED` and `APPROVED` are both
immediately walked forward by a `SYSTEM` transition inside the same
service call that creates them (M05's `submitOffer()`/`approveOffer()`),
so a case never actually rests there long enough for an SLA clock to
mean anything.

---

### D-075 — 2026-08-31 — "Working days" excludes only Saturday/Sunday; no BNU holiday calendar

**Decision:** `workingDaysElapsed()` treats every non-weekend day as a
working day. Logged as **OQ-14**.

**Why:** `MASTER_PROMPT.md` never specifies a holiday calendar, and none
exists anywhere in this build's scaffolding. Not excluding extra
holidays is the more restrictive reading for BR-27's own purpose — the
clock keeps running through a public holiday, protecting the student
more, not less. A real BNU calendar (if one exists) would be a small,
additive refinement to this one function.

---

### D-076 — 2026-08-31 — The Focal-SLA "already escalated" check is scoped to the current stay in the pending state, not the case's whole history

**Decision:** `runFocalSlaSweep()`'s dedup query is
`Notification` for this `caseId` + template, `createdAt >=` the most
recent `CaseEvent` that entered the pending state — not "ever, for this
case."

**Why:** `OFFER_UNDER_REVIEW` is re-enterable — a rejected offer that
gets revised and resubmitted cycles back through it. An escalation sent
during an *earlier* review cycle must not silently suppress a real one
in a *later* cycle for the same case.

---

### D-077 — 2026-08-31 — Time-travelled tests pass a future `now` to the sweep functions; they never mutate `CaseEvent.createdAt`

**Decision:** `runFocalSlaSweep()`/`runSupervisorReminderSweep()`/
`runHodDigest()` all take an optional `now: Date` parameter. This
module's own tests construct a real case/token at real "now," then call
the function with `now` travelled forward by the relevant number of
days — never an `UPDATE` against an existing timestamp.

**Why:** Found while writing this module's own tests: `case_events` has
been append-only at the privilege level since M01 (`REVOKE UPDATE,
DELETE`, BR-26) — `scit_app` genuinely cannot backdate a `CaseEvent` row,
in tests or in production. A first draft of these tests tried exactly
that and failed with a real `permission denied` error before ever
reaching a logic bug. Passing a travelled `now` is not a workaround for
that constraint — it's the correct shape for "time-travelled test" in
the first place, and was already how these functions were designed
before the mistake was made.

---

### D-078 — 2026-08-31 — The HoD digest reports only Focal-SLA breaches and supervisor escalations, and is skipped entirely when there's nothing to report

**Decision:** `runHodDigest()` covers exactly the two things
`src/server/sla/service.ts` itself tracks. It sends zero emails — and
logs zero `Notification` rows — on a day with nothing to report.

**Why:** MASTER_PROMPT.md §7 gives M13 the fuller "counts by state,
overdue eligibility, pending verifications, all waivers, all restarts"
dashboard picture explicitly — duplicating any of that here would be
guessing at M13's own scope. A guaranteed-empty daily email trains its
recipient to stop reading it, which would defeat a *real* digest's
purpose once M13 extends this one.

---

### D-079 — 2026-08-31 — TanStack Table v8, not the newly-released v9

**Decision:** `@tanstack/react-table@^8`, pinned explicitly, not the
default `latest` (9.2.4 at the time of writing).

**Why:** MASTER_PROMPT.md §6.1 names "TanStack Table" without a version
— unlike every other stack row, which pins one. v9 is a real, stable
npm release (not a beta), but a ground-up rewrite around a new
`TableFeatures` API with no meaningful body of documentation, tutorials,
or community usage to build against yet, and it doesn't work as a drop-
in replacement for the well-established v8 API every existing reference
material describes. v8 remains fully maintained and is what "TanStack
Table" conventionally means for a production build today — the safer,
better-understood choice for an institutional portal §10 explicitly
wants free of "design debt."

---

### D-080 — 2026-08-31 — `exceljs` for the XLSX export

**Decision:** `exceljs`, not the more commonly reached-for `xlsx`
(SheetJS) package.

**Why:** §6.1 names `@react-pdf/renderer` for PDF but doesn't name an
XLSX library at all — a real gap, not a substitution. `xlsx`/SheetJS has
a history of parsing-side CVEs; this build only ever *writes*
spreadsheets, never parses an untrusted one, so that history isn't a
direct risk here, but "actively maintained, no CVE history" is a
reasonable bar for a new dependency regardless of which side of the
read/write boundary it's used on.

---

### D-081 — 2026-08-31 — Hand-written UI primitives, not the shadcn CLI

**Decision:** `Button`/`Badge`/`Card` (`src/components/ui/`) are
written directly against `components.json`'s already-declared
conventions (`cva` variants, the `@/lib`/`@/components` aliases, the §10
palette) rather than generated by `npx shadcn add`.

**Why:** The CLI fetches component source from a remote registry at
generation time — an extra moving part, and a network dependency at
build/dev time this environment doesn't reliably have — for exactly
three small, well-understood components this session needs. The output
shape is identical either way, since both start from the same
conventions `components.json` (M00) already fixed.

---

### D-082 — 2026-08-31 — Four new screen-view capabilities: `dashboard.view_student`/`_focal`/`_hod`/`_dean`

**Decision:** Added to the matrix (`src/server/authz/matrix.ts`),
mirroring `grade.reverse` (D-059)/`escalation.rule_restart` (D-070)'s
established pattern for a real capability gap.

**Why:** MASTER_PROMPT.md §3's eighteen rows are all about mutations —
none of them answer "who may load `/hod` versus `/dean`." Reusing
`case.view_any` (held by `FOCAL`/`HOD`/`DEAN` all at once, by design,
for the API routes it already covers) can't discriminate between the
three screens each of those roles needs kept separate from the other
two's. Reusing an unrelated mutation capability as a role proxy (e.g.
`grade.award` to mean "is HOD") would also work mechanically but reads
as borrowing intent the capability was never meant to carry — matrix.ts's
own rule against branching on a role name directly (D-004) applies here
just as much as it does to a mutating route.

---

### D-083 — 2026-08-31 — M13 delivers views and exports, not the action-taking forms behind them

**Decision:** Every M13 screen is read-only. Approving an offer,
verifying a deliverable, countersigning a restart, ruling on a waiver —
every mutating action this module's data touches — still only exists as
the API route M05 through M11 already built; nothing here wraps one in
a form.

**Why:** §7's own M13 summary line describes screens and exports, not
workflow UI, and the done-criterion ("the HoD can answer... in one
screen") is fully satisfiable by a read-only view. §10's own requirement
that "every destructive-looking action... requires a written reason in
the same dialog" only applies once such a form exists — building six-plus
of them (one per mutating action this module's screens surface) is a
large, separable body of work the done-criterion doesn't need, not a
gap in this module's own scope.

---

### D-084 — 2026-08-31 — "Overdue eligibility" reads as eligible + zero cases + no action taken

**Decision:** `getHodDashboard()`'s overdue-eligibility list is
students with `cases: none` whose `computeEligibility(...).isEligible`
is true — the same candidate population BR-02's sweep already watches
(`isPastAutoEnrollBoundary`), filtered to the earlier, `isEligible`
threshold instead.

**Why:** §7's M13 summary names "overdue eligibility" without defining
it. A student who's been eligible for a semester or two and never opened
a case is exactly "at risk of not graduating" in the done-criterion's
own words — a real, earlier, more actionable signal than waiting for
BR-02's semester-6 fallback to auto-enroll them regardless.

---

### D-085 — 2026-08-31 — One PDF artefact this session: the case summary

**Decision:** `@react-pdf/renderer` backs one document,
`src/server/exports/case-summary-pdf.tsx`. The supervisor-evaluation PDF
and department annual report §10 also names are not built this session.

**Why:** The case summary is the one artefact every module through M09
already fully supports end to end (offer, deliverables, verification,
grade) and the one the done-criterion's "one screen" scenario most
directly implies backing up with a document a student or Focal Person
can hand someone. The other two are real and useful, additive
(same machinery, a different query each) — not started for lack of time
in one session, not a design gap.

---

### D-086 — 2026-08-31 — Vitest needs `oxc: false` *and* `esbuild.jsx: "automatic"` to import any `.tsx` file at all

**Decision:** Both `vitest.config.ts` and `vitest.integration.config.ts`
now set `oxc: false, esbuild: { jsx: "automatic" }`.

**Why:** A real, previously-invisible tooling gap: `tsconfig.json`'s
`jsx: "preserve"` is correct for Next's own SWC-based build, but Vite
(loading the same file directly, for a test) needs to actually transform
JSX itself, or it hands raw, un-transformed JSX to a plain-JS parser and
fails with "invalid JS syntax." No test imported *any* `.tsx` file
before M13 (every prior module's tests only ever touched `.ts` service/
route code), so this was never exercised until `case-summary-pdf.tsx`
needed testing. The first fix attempt (`esbuild.jsx` alone) still
failed identically — this Vite version's default transform pipeline is
Oxc (Rolldown's Rust-based transformer), which silently ignores
`esbuild.jsx` entirely once both are set, logging "oxc options will be
used" instead of erroring, and Oxc's own `TransformOptions` has no
equivalent JSX-runtime knob to redirect. Disabling Oxc first is what
actually routes JSX through the esbuild pipeline where the override
takes effect.

---

### D-087 — 2026-08-31 — The "safe numeric window" for an eligibility-upper-bound test is relative to that file's own position in the run, not a fixed range

**Decision:** No code change — a correction to a wrong assumption
caught in this module's own tests before it shipped. `M13_dean_dashboard
.test.ts`'s two restart tests (needing G2 to genuinely pass) and
`M13_student_dashboard.test.ts`'s one upper-bounded eligibility test now
use blocks in the hundreds of millions, not the 41000-49999 window
D-064 established for M10.

**Why:** D-064's window was correct *for the files that established it*
(`BR16_BR20_...`/`BR17_...`/etc.), because every one of them sorts before
`M03_eligibility_route_ownership.test.ts` alphabetically ("BR1" < "M0"),
so M03's own 50000/60000/70000/80000 blocks don't exist yet when those
tests run. Every M13 file sorts *after* M03's ("M0" < "M1"), so those
same blocks — plus `M03_semester_admin_routes.test.ts`'s own
`nextSequenceNumber()`-assigned semesters, "always above the current
global max" and observed reaching into the tens of millions in a real
run — already exist by the time M13's tests run, and all of them are
`>=` any block below 50000. A first draft of these tests reused D-064's
specific numbers without re-deriving whether they still held for a file
in a different position in the run; they didn't, and the fix is a much
higher block (hundreds of millions, still comfortably under Postgres
`INTEGER`'s ~2.1 billion ceiling) rather than a narrower "below X"
window that would need re-deriving again for the next module that hits
this.
