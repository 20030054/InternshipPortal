# Progress

**Current module:** M03 — Roster, semesters and the eligibility engine
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; `pnpm lint`, `pnpm typecheck`, `pnpm test` [47/47],
`pnpm test:integration` [57/57] all pass; real credentials sign-in and
cross-student ownership verified against the running app in Docker)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [ ] M03 Roster, semesters and the eligibility engine  <- up next, not started

## Where I stopped
Implemented M02 in full per `/docs/modules/M02.md`: Auth.js v5 credentials
sign-in (argon2id via `src/server/auth/password.ts`), a new migration
adding `failed_login_attempts`/`locked_until`/`token_version` to `users`
and the `password_reset_tokens` table (partial unique index for "one live
token", same mechanism as M01's supervisor tokens), the full 18-row §3
capability matrix (`src/server/authz/matrix.ts`) plus a pure
`requireCapability()` decision function, brute-force lockout (5 attempts /
15 min) and Redis-backed rate limiting (login + password-reset, both by
IP), the password-reset request/confirm routes, and a new ESLint rule
(`eslint-rules/require-capability-on-mutation.mjs`) that fails the build
if a route under `src/app/api/**` mutates without calling
`requireCapability()` — `src/app/api/auth/**` is excluded, since those are
the pre-authentication entry points themselves.

Sessions are JWT-based (not Auth.js's database adapter — no OAuth
providers exist to justify its Account/Session tables yet). Invalidation
on password/role change works by re-reading `tokenVersion` and roles from
the database on every request, in two independent places
(`config.ts`'s `jwt` callback *and* `getCurrentIdentity()`) rather than
trusting Auth.js's own invalidation semantics alone — see DECISIONS.md
D-015/D-016.

`Case` has no route yet (M04/M05), so M02's own done criterion — "a
student's session cannot read another student's case" — is proven against
`Student` via a new `GET /api/students/:id` (`student.view_own` vs.
`student.view_any`, 404 not 403 on a denied cross-student read). This is
scaffolding, explicitly not extended with case-shaped behavior; see
M02.md's "Scope decisions."

One real bug found via `next-auth`'s package structure, not anticipated
in the spec: importing anything from the top-level `next-auth` package
(even just the `CredentialsSignin` error class) pulls in `next/server`,
which fails to resolve outside Next.js's own bundler — broke a Vitest
integration test that imports the credentials-authorize logic directly.
Fixed by importing `CredentialsSignin` from `@auth/core/errors` instead
(added as an explicit pinned dependency) — see DECISIONS.md D-017.

Verified against the real `docker compose` stack: migrated + provisioned
`scit_app`'s password via a throwaway container on the compose network,
brought the full stack up (every service healthy, Caddy included), then
ran the *actual* Auth.js credentials flow against the running app —
fetched a real CSRF token, signed in as a seeded dev user, got a real
`authjs.session-token` cookie, hit `/api/me` and `/api/students/:id` with
it. Confirmed: wrong password issues no cookie; a student reading their
own record gets 200; reading another student's gets 404; a Focal Person
reading any student gets 200. This is the actual mechanism working
end-to-end, not just the mocked-session integration test suite (57
passing) agreeing with itself.

## Next action
Start M03: write `/docs/modules/M03.md`, then implement roster CSV/XLSX
import, semester configuration, the graduation-clock computation
(BR-04, read-only to every human role), the eligibility recomputation job,
and the BR-02 auto-enrolment sweep. This is the first module that touches
BR-01 through BR-05 and needs a real answer — or another restrictive
default — for OQ-01 (deadline dates) and OQ-06 (roster source format)
before the import format can be finalized.

## Blocked on
- OQ-01 (per-semester document deadlines) — blocks M03's deadline
  configuration; `semesters.document_deadline` is nullable until answered.
- OQ-06 (roster source system/format) — blocks M03's import format;
  implement CSV as the safe default (universally exportable from any SIS)
  unless told otherwise.
- OQ-05 (BNU OIDC/SAML) — implemented restrictive default in M02
  (self-managed argon2id credentials); `TODO(OQ-05)` in
  `src/server/auth/config.ts`.
- OQ-10 (tenancy) — implemented restrictive default in M01 (no tenant
  column); `TODO(OQ-10)` comments on `User`/`Student` in schema.prisma.
