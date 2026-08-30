# Conventions

Read once at the start of the project, then trust. Update this file only when
a convention actually changes, and note the change in `DECISIONS.md`.

## Repository layout

Single Next.js application (not a multi-package monorepo — there is only one
deployable app plus a worker that shares its image, so a workspace tool would
add ceremony without benefit).

```
/src
  /app                  Next.js App Router routes (pages, layouts, route handlers)
    /api/...            Route handlers (thin — validate, call service, respond)
  /server
    /authz              matrix.ts (the single source of truth for §3), requireCapability()
    /state-machine       transition table, executor, guards
    /services            business logic, one file per bounded concern (approval.ts, restart.ts, waiver.ts, ...)
    /db                  Prisma client singleton, seed scripts
    /jobs                BullMQ queue and worker definitions
    /mail                Nodemailer transport, templates
  /lib                  shared utilities usable from client or server (formatting, constants)
  /components            shadcn/ui-based UI components
  /schemas               Zod schemas, shared by client and server
/prisma
  schema.prisma
  /migrations
/tests
  /unit
  /integration
  /e2e
/docs                    see §0.1 of MASTER_PROMPT.md
```

## TypeScript

- `strict: true`. Zero `any`, zero `@ts-ignore`, zero `@ts-expect-error` used
  to silence a real problem (an `@ts-expect-error` documenting a genuinely
  expected compile error in a test is acceptable; anything else is not).
- Prefer explicit return types on exported functions, especially in
  `/server/services` and `/server/state-machine` — these are the audit
  surface and must be easy to read without inferring through call chains.
- No `enum` for state/role/grade-type unions — use string literal union types
  or `as const` objects, matched by a Zod schema, so the same source of truth
  validates at runtime and types at compile time.

## Naming

- Files: `kebab-case.ts`. React components: `PascalCase.tsx`.
- Business rule tests: named after the rule, e.g.
  `BR07_offer_requires_work_description.test.ts`, placed in `/tests/unit` or
  `/tests/integration` depending on what they exercise.
- Database tables: `snake_case`, plural (`cases`, `case_events`,
  `restart_requests`). Prisma model names: `PascalCase` singular, mapped via
  `@@map`.
- Capabilities in the authority matrix are named as
  `verb_object` strings, e.g. `case.view_own`, `offer.approve`,
  `grade.award`, `restart.countersign` — never bare role names. A route
  checks a capability, never a role.

## Services and the state machine

- The transition executor (`/server/state-machine/executor.ts`) is the only
  code path permitted to write `cases.state`. No service outside it calls
  `prisma.case.update({ data: { state: ... } })` directly, ever — even
  internally. This is enforced twice: by convention here, and by the
  database trigger from M01. Convention is not the control; the trigger is.
- Guards are pure functions: `(ctx) => { ok: true } | { ok: false, reason: string }`.
  No database writes inside a guard. A guard may read data it's given in
  `ctx`, but the executor is responsible for fetching that data.
- A route handler never contains business logic. It: validates input with a
  Zod schema, calls `requireCapability()`, calls one service function, and
  shapes the response. If a route handler is more than ~30 lines, logic has
  leaked into it.

## Errors

- Domain errors are typed classes (`NotEligibleError`,
  `IllegalTransitionError`, `SameSignerError`, ...) thrown from services and
  translated to HTTP status + shape at the route boundary. No route inspects
  `error.message` strings to decide status codes.
- An unknown/illegal state transition throws — it is never a silent no-op
  (BR-25).

## Testing

- Vitest for unit and integration tests, Playwright for e2e.
- Every business rule (BR-01…BR-28) has at least one test file named after
  it, testing both the pass and the fail path.
- Integration tests hit the API layer (route handlers / server actions), not
  services directly, when the thing under test is authorization — the
  capability matrix in §3 must be proven at the boundary a real request
  crosses.
- No test depends on wall-clock time; SLA/escalation tests use an injectable
  clock or time-travel the job scheduler.

## Git and commits

- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`),
  scoped to a module where useful (`feat(m05): offer approval endpoint`).
- One module per session, per `MASTER_PROMPT.md` §0.2. A commit (or a small
  series of commits) closing out a module should correspond to the
  `/docs/PROGRESS.md` update marking it complete.

## Package manager

pnpm. Faster installs, strict dependency resolution (won't silently let a
transitive dependency's package be imported), and a single lockfile — no
particular master-prompt requirement, this is a build-tool choice; logged in
`DECISIONS.md`.

## What NOT to do

- Do not add a UI-only permission check without a matching server-side
  `requireCapability()` call. The UI hides; the API forbids.
- Do not introduce a new npm dependency for something the stack in §6
  already covers (e.g. no date library beyond what's needed — use `Intl` /
  small utilities; no second form library; no second table library).
- Do not create a "misc" or "utils" dumping-ground file. Utilities live next
  to the concern they serve, or in `/lib` only if genuinely cross-cutting.
