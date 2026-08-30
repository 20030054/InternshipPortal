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
