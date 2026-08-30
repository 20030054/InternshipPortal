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
