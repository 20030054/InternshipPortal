# Architecture

Standing technical reference. Consult this instead of re-reading
`MASTER_PROMPT.md` in future sessions. It summarises §5 (state machine), §6
(stack) and §8 (deployment) of that document — if this file and the master
prompt ever disagree, the master prompt wins and this file is wrong and
should be corrected.

---

## 1. State machine

The whole system is a single case moving through a fixed set of states,
plus two parallel "gate" workflows (restart, waiver) that produce their own
linked records. There are twenty states in total (`ELIGIBILITY_PENDING`
through the terminal states); the full list lives in
`MASTER_PROMPT.md` §5.1 and will be encoded as the literal source of truth
in `src/server/state-machine/states.ts` during M04 — this file does not
duplicate the list because it would drift.

**Shape of a transition:**

```ts
type Transition = {
  from: CaseState;
  to: CaseState;
  actorRole: Role;
  guards: GuardFn[];   // pure predicates: {ok:true} | {ok:false, reason}
  requiresReason: boolean;
  emitsEvent: EventType;
};
```

**Rules that must never be violated by any future code:**

1. A transition fires only if every guard in its list passes. A failing
   guard is itself an audited event, not a silent rejection.
2. Exactly one code path — the transition executor — is allowed to write
   `cases.state`. This is enforced twice: at the service layer by
   convention (nothing else calls it), and at the database layer by a
   trigger that rejects any `UPDATE` to `cases.state` that didn't originate
   from the executor's stored procedure / marked transaction. The trigger
   is the real control; the convention is just so humans don't have to
   discover that the hard way.
3. Guards are pure — no I/O, no database writes, unit-testable with plain
   objects in, plain result out. The executor is responsible for fetching
   whatever data a guard needs and passing it in.
4. An attempted transition not present in the table is a hard error, never
   a no-op (BR-25).

**The restart gate** (reachable only from `CLOSED_INCOMPLETE`) requires,
in order: G1 (different organisation, fuzzy-matched with a configurable
threshold and human confirmation on a flagged match), G2 (at least one full
semester remains before the graduation boundary), G3a (Focal Person
signature), then a *separate* transition where G3b (HoD signature) and G5
(signer ≠ the Focal signer) must hold, gated additionally by G4 (restart
count below `RESTART_CAP`). Any guard failure produces `RESTART_DENIED` and
opens a Dean escalation record — there is no resubmission on the same
facts, only escalation.

**The waiver path** skips the eight-step process entirely and is therefore
the most tightly gated: three sequential signatures (Focal initiates with a
≥300-character exceptional-circumstance narrative plus evidence → HoD
counter-signs → Dean gives final approval), capped at one per student ever,
and permanently visible on the HoD dashboard and annual report so the
exception can never quietly become the norm.

Both gate workflows produce structured records (`restart_requests`,
`waivers`) separate from `case_events` — the case's own event log stays a
clean history of what actually happened to *that* case, while the gate
tables hold the richer sign-off detail (who signed, when, with what
reason).

---

## 2. Technology stack

One language end to end (TypeScript, strict mode, zero `any`) across a
single Next.js 15 App Router application:

| Concern | Choice | Why it matters here |
|---|---|---|
| Runtime | Node.js 22 LTS | long support window for a system universities run for years |
| Framework | Next.js 15 (App Router) | server components + server actions let route handlers stay thin and colocate with the app instead of a separate API service |
| ORM | Prisma 6 over PostgreSQL 16 | versioned migrations, typed queries, and — critically — Postgres gives us triggers, partial unique indexes and privilege separation that a weaker ORM/DB pairing couldn't enforce at the data layer |
| Validation | Zod 3 | one schema, imported by both the client form and the server route handler, so client and server validation cannot drift apart |
| Auth | Auth.js v5 | credentials + argon2id today, with a clear upgrade path to SAML/OIDC against BNU's IdP later (OQ-05) without a rewrite |
| Jobs | BullMQ over Redis | durable timers survive a restart, which matters for SLA escalation (BR-27, BR-28) and supervisor reminders — these cannot be in-memory `setTimeout`s |
| Mail | Nodemailer → BNU SMTP relay | no third-party service ever holds student data |
| UI | Tailwind + shadcn/ui | accessible primitives out of the box, matches the WCAG 2.1 AA requirement in §10 without hand-rolling focus management |
| PDF | `@react-pdf/renderer` | server-side generation of case summaries, evaluation PDFs, the annual report |
| Testing | Vitest (unit/integration) + Playwright (e2e) | |

**Why this combination, structurally:** every business rule in §4 of the
master prompt needs to be enforced at more than one layer (see §4 of
`PROJECT_DOCUMENTATION.md`, "three enforcement layers"). Postgres gives the
database-level layer real teeth (constraints, triggers, revoked privileges)
that a document store or a weaker RDBMS setup wouldn't. Everything else in
the stack is chosen so a small university team can maintain it in one
language without bespoke build tooling.

---

## 3. Deployment topology

Seven Docker Compose services on an internal network; only Caddy publishes
ports.

```
Internet / campus network
        │
    [ caddy ]  :80 :443     TLS termination (automatic HTTPS or internal cert)
        │
    [ app ]                 Next.js, non-root, no published ports
        ├── [ postgres ]    no published ports; two DB roles (see below)
        ├── [ redis ]       no published ports; BullMQ backing store
        └── [ clamav ]      upload scanning, no published ports
    [ worker ]               same image as app, different command, consumes BullMQ jobs
    [ backup ]                cron sidecar running pg_dump on a schedule
```

Five **named volumes**, never bind mounts: `scit_pgdata`, `scit_uploads`
(student documents, outside the web root, reachable only through an
authenticated streaming route — never served statically), `scit_redis`,
`scit_backups` (30-day rotation), `scit_caddy` (certs/state).

**Startup ordering:** `app` and `worker` wait on Postgres and Redis
*health*, not just process start — a container that's listening but not
yet accepting connections must not be treated as ready.

**Two database roles**, which is the mechanism that makes several §9
security guarantees real rather than aspirational:
- **migration role** — owns the schema, runs `prisma migrate deploy`
  during upgrades, never used by the running app.
- **runtime role** — what `app` and `worker` actually connect as. No DDL
  rights. `INSERT` + `SELECT` only on `audit_events` (no `UPDATE`/`DELETE`)
  — this is what makes the audit log tamper-evident at the database level,
  not just "nobody built a delete button."

**Secrets** come from a `600`-permission `.env` file (or Docker secrets),
never committed; `.env.example` documents every key with no value filled
in. Every service declares a `healthcheck` and `restart: unless-stopped`.

**Uploads pipeline** (relevant to deployment because it spans two
containers): a file is validated for extension + magic bytes + MIME in
`app`, handed to `clamav` for scanning, and only written to `scit_uploads`
under a generated UUID filename if it passes. The original filename is
retained as metadata only, never used to construct a path — this is what
makes path traversal structurally impossible rather than merely filtered.

Full environment variable list, volume table and the operator runbook
outline: `MASTER_PROMPT.md` §8.2–§8.3 (the runbook itself is written during
M14 as `/docs/RUNBOOK.md`).

## 4. UI layer

Two kinds of screen, both Server Components fetching directly via
Prisma/service functions — never a page `fetch()`ing its own API:

- **Dashboards** (`/`, `/focal`, `/hod`, `/dean`) — read-only, built in
  M13. `DataTable` (TanStack Table) for every list; `Card`/`CardTitle`/
  `Badge`/`Button` (hand-written against `components.json`'s shadcn
  conventions, not the CLI — D-079) for everything else.
- **`/cases/:id`** — one screen per case, added post-master-prompt as
  M15 (`docs/modules/M15.md`; not one of §7's fifteen modules). Same
  `case.view_own`/`case.view_any` + "404, not 403" ownership pattern
  every per-case API route has used since M05. Renders whichever
  action forms the viewer's capabilities and the case's current state
  make relevant (D-102) — every form is a thin client component
  (`src/components/case-actions/*.tsx`) built on one shared wrapper
  (`src/components/action-form.tsx`, D-101) that `fetch()`s the
  already-existing, already-tested `/api/**` route directly, with zero
  new server-side mutation logic anywhere in this layer. Dashboard rows
  link into this page rather than growing bespoke inline actions of
  their own.

Restart-gate and waiver-path forms (the two "exception paths," §1.2)
are not built yet — every one of those routes is real, tested, and
reachable via the API/`docs/RUNBOOK.md` today; only their UI is a
deliberate, documented gap (`docs/modules/M15.md` "Scope").
