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
