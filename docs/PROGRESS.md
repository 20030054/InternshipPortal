# Progress

**Current module:** M01 — Data model and migrations
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass — 5/5 tests)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [ ] M01 Data model + migrations  <- up next, not started

## Where I stopped
Implemented M00 in full per `/docs/modules/M00.md`: Next.js 15 App Router
skeleton (TS strict, Tailwind + the §10 palette, shadcn-ready
`components.json`/`cn()`), `/api/health` and `/api/ready` (the latter
checking real Postgres/Redis connectivity, tested with mocked `pg`/`ioredis`
for both the up and down paths), multi-stage non-root `Dockerfile` (shared
by `app` and `worker`, `worker` currently a heartbeat-only placeholder),
`docker-compose.yml` (all 7 services, all 5 named volumes, only `caddy`
publishes ports), `Caddyfile`, `.env.example` covering every §8.2 variable,
and a GitHub Actions CI workflow (lint → typecheck → test → docker build).

Verified locally, not just written: `docker compose up --build` brings
every service healthy (postgres, redis, clamav, app, worker, backup);
`/api/health` and `/api/ready` both return correctly from inside the `app`
container against the real postgres/redis containers; `app`/`worker` run as
uid 10001, not root; `Caddyfile` validates (`caddy validate`). The one thing
*not* exercised end-to-end was Caddy actually proxying on :80 — this dev
machine already has an unrelated project's Caddy bound to ports 80/443, so
`caddy-1` failed to start with a port-already-allocated error. That's a
local-machine conflict, not a defect in the compose file; confirm on a
clean host or after freeing 80/443 locally before fully trusting that leg.

Package versions were pinned to specific patches (not loose `^` ranges) —
see `pnpm-lock.yaml` and `package.json`; the choice to pin exactly, and to
use `pg`/`ioredis` directly for M00's readiness probe ahead of Prisma
arriving in M01, are recorded in `DECISIONS.md` D-006 and D-007.

## Next action
Start M01: write `prisma/schema.prisma` with every table in
`/docs/modules/M01.md`, the partial unique indexes (BR-06, BR-23), check
constraints (BR-07, BR-13), the two database roles and their grants, the
`cases.state` write-trigger (BR-25), and the seed script. Prove each
business-rule constraint with a test per M01's test list, including the two
"raw SQL should fail" tests for the trigger and the audit-table privileges.

## Blocked on
- OQ-10 (SCIT-only vs shared BNU tenancy) — implementing the restrictive
  no-tenant-column reading per M01's spec; marked `TODO(OQ-10)` in
  `schema.prisma` once that file exists. See OPEN_QUESTIONS.md.
