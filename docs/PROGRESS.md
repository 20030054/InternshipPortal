# Progress

**Current module:** M02 — Identity, sessions and authorisation
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state, Caddy included; `pnpm lint`, `pnpm typecheck`, `pnpm test`
[5/5], `pnpm test:integration` [29/29] all pass)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [ ] M02 Identity, sessions and authorisation  <- up next, not started

## Where I stopped
Implemented M01 in full per `/docs/modules/M01.md`: `prisma/schema.prisma`
with all 19 tables and every enum, one hand-written init migration whose
Prisma-generated DDL is followed by raw SQL for what Prisma's schema
language can't express — the BR-06 partial unique index, the
one-live-supervisor-token partial index, three CHECK constraints
(defence-in-depth for BR-12, BR-17 G3/G5, BR-22), the document
no-reactivation trigger, the `cases.state` write-guard trigger (BR-25), and
the `scit_app` runtime role with its restricted grants (BR-26, BR-14).
Also: `scripts/db/provision-runtime-role.sh` (sets the role's password
out-of-band, no secret committed), `prisma/seed.ts` (5 roles, 2 semesters,
4 staff + 5 student fixtures, idempotent), `src/server/db/client.ts` (the
Prisma Client singleton the app will use — connects as the runtime role,
not the migration role), and 9 integration test files (29 tests) proving
every constraint/trigger/grant against a real Postgres.

Two real bugs surfaced and got fixed, not just noted: the Dockerfile's
`deps` stage installed before `prisma/schema.prisma` existed in its build
context, so the generated Prisma Client had none of our models — `next
build` failed typechecking `prisma/seed.ts`'s `RoleName` import. Fixed by
running `prisma generate` explicitly in the `builder` stage. Separately,
M00's `TODO(M01)` about whether the query engine needs libssl was
confirmed true — the Dockerfile now installs `openssl` in every stage that
touches Prisma. Both are D-013/D-014 in DECISIONS.md.

Two statements in the original `/docs/modules/M01.md` draft were corrected
during implementation (documented as D-011/D-012, and the module doc
itself was edited to match): document status un-reactivation needs a
trigger, not a CHECK (a CHECK can't see the row's previous value); and the
runtime role's grants are applied by the migration, not the seed script
(production runs `migrate deploy`, never `db seed`).

Verified against the real `docker compose` stack, not just a standalone
Postgres: brought up `postgres`+`redis`, ran `prisma migrate deploy` and
the provisioning script from a throwaway container on the compose network,
then `docker compose up --build` for the full stack — every service
healthy including `caddy` this time (M00's port-80 conflict with an
unrelated local project wasn't present this session), confirmed
`/api/ready` reports the real schema reachable, and confirmed HTTP->HTTPS
redirect and a 200 through Caddy itself.

CI (`.github/workflows/ci.yml`) has a new `db-tests` job with a Postgres
service container running migrate deploy + the provisioning script +
`pnpm test:integration`. Not yet exercised on actual GitHub Actions — no
remote is configured for this repo yet.

## Next action
Start M02: Auth.js v5 setup, argon2id password hashing, session handling,
`src/server/authz/matrix.ts` (the single source of truth for the §3
capability matrix), a `requireCapability()` helper, brute-force lockout,
password reset via email. Per `/docs/modules/M02.md` — not yet written;
write that spec first, per §7's "write the module spec before
implementing it" rule.

## Blocked on
- OQ-05 (BNU OIDC/SAML vs. self-managed passwords) directly blocks how
  much of M02 is worth building — implement password-based Auth.js
  credentials per the restrictive default (self-managed, since no IdP
  commitment exists) and mark the OIDC path `TODO(OQ-05)`.
- OQ-10 (tenancy) — implemented restrictive default in M01 (no tenant
  column), `TODO(OQ-10)` comments on `User`/`Student` in schema.prisma.
