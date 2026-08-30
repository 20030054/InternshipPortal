# Master Build Prompt — SCIT Internship Portal

**Institution:** School of Computer & Information Technology (SCIT), Beaconhouse National University (BNU), Lahore
**Deliverable:** A production, self-hosted, Docker-deployed web portal that administers the SCIT internship course end to end.

Read this document once, in full, before writing any code. It is the contract. Where this document and your own judgement disagree, this document wins. Where this document is silent, ask before inventing.

---

## 0. How to work (read this first — it governs every session)

You will build this over many sessions. Context is expensive. Follow these rules so that no session is spent re-discovering what the last session did.

### 0.1 The progress protocol

Create these files in the repository before writing any application code:

```
/docs/PROGRESS.md          <- session state. The ONLY file you must read every session.
/docs/CONVENTIONS.md       <- code style, naming, patterns. Read once, then trust.
/docs/DECISIONS.md         <- append-only log of architectural decisions and their reasons.
/docs/OPEN_QUESTIONS.md    <- things blocked on the client. Never guess past these.
/docs/modules/M01.md ... M14.md   <- one spec per module (contents defined in §7).
```

**At the start of every session, read exactly three things:**
1. `/docs/PROGRESS.md`
2. The module spec for the module named as "current" in PROGRESS.md
3. The output of `tree -L 3 -I 'node_modules|.next|.git'`

Do not read the whole repository. Do not re-read files you are not about to edit. Do not summarise the codebase back to the user — they know what they asked for.

**At the end of every session, update `/docs/PROGRESS.md`** using exactly this structure, and nothing longer:

```markdown
# Progress

**Current module:** M05 — Approval workflow
**Last session:** 2026-09-14
**Build status:** green (docker compose up succeeds, 41/41 tests pass)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [ ] M05 Approval workflow  <- in progress

## Where I stopped
Wrote `src/server/services/approval.ts` and its guard tests. The HoD
counter-signature path is stubbed and throws NotImplemented.

## Next action
Implement `recordHodSignature()` and wire it to POST /api/cases/:id/hod-sign.

## Blocked on
- OQ-03 (restart cap number) — see OPEN_QUESTIONS.md
```

Rules for PROGRESS.md: keep it under 120 lines. When "Completed modules" grows long, move detail (not the checkboxes) to `/docs/PROGRESS_ARCHIVE.md`. Never let it become a narrative.

### 0.2 Token discipline

- One module per session. Do not start M06 in the same session you finished M05.
- Never paste an entire file into the conversation. Use targeted edits.
- Never re-explain the architecture to the user. It is in `/docs/ARCHITECTURE.md`; link to it.
- When you need to know how something was done, read `/docs/DECISIONS.md`, not the source.
- Generate code, then run the test suite. Report the failure line, not the whole log.
- If a module spec is ambiguous, add the question to `OPEN_QUESTIONS.md` and implement the **most restrictive** interpretation. Never the most permissive.

### 0.3 Definition of done, per module

A module is not complete until all five are true:
1. Code written and type-checks with zero `any` and zero `@ts-ignore`.
2. Unit tests for every business rule the module implements, including the negative cases.
3. At least one integration test that proves the rule cannot be bypassed via the API.
4. `/docs/PROGRESS.md` updated.
5. `docker compose up --build` still succeeds from a clean volume state.

---

## 1. What this system is

SCIT runs a 3-credit-hour Internship course. Every student must pass it to graduate. Today the process runs on email, a Google Form and a Google Sheet. This portal replaces all of it.

The portal's job is not to be flexible. Its job is to make the departmental policy **the only thing that can happen**. Every screen, every API route and every database constraint exists to enforce one of the business rules in §4.

### 1.1 The eight-step process (the normal path)

| # | Step | Actor | System state on entry |
|---|------|-------|------------------------|
| 1 | Check eligibility | System | `ELIGIBILITY_PENDING` |
| 2 | Secure internship | Student (offline) | `ELIGIBLE` |
| 3 | Submit offer letter | Student | `OFFER_SUBMITTED` |
| 4 | Receive approval | Focal Person | `OFFER_UNDER_REVIEW` → `APPROVED` |
| 5 | Conduct internship | Student | `IN_PROGRESS` |
| 6 | Submit documents | Student + Supervisor | `DOCS_PENDING` |
| 7 | Verify & evaluate | Focal Person, then HoD | `PENDING_VERIFICATION` → `VERIFIED` → `GRADE_RECOMMENDED` |
| 8 | Grade awarded | HoD | `CLOSED_PASS` or `CLOSED_INCOMPLETE` |

### 1.2 The three exception paths

There are exactly three ways a case can leave the normal path. No fourth path may exist.

- **Restart after Incomplete** (§5.1) — gated, dual sign-off, capped.
- **Waiver under exceptional circumstances** (§5.2) — gated, triple sign-off, capped at one per student, ever.
- **Withdrawal** (§5.3) — student abandons a case before it is approved; leaves no grade.

---

## 2. Roles and authority

Authority is **enumerated, not inherited**. Nobody has "admin over everything." Every capability below is a separate permission checked server-side on every request.

### 2.1 Student
- Sees only their own case. Cannot enumerate, search or reference any other student.
- Can: view eligibility, open a case, upload offer letter, submit work description, update progress log, upload completion certificate, trigger the supervisor evaluation email, view their own status and grade, download their own documents.
- Cannot: edit any field after the case leaves `OFFER_SUBMITTED` except the progress log; delete any uploaded document; see internal review comments; see who signed what.

### 2.2 Internship Focal Person
- Sees all SCIT cases.
- Can: approve/reject offer letters with a mandatory written reason, verify the three deliverables individually, record a verification method per document, recommend a grade, initiate a restart request, initiate a waiver request, resend supervisor links.
- **Cannot:** award a final grade, approve their own restart request alone, edit a student's uploaded document, alter the graduation clock, or delete anything.

### 2.3 Head of Department (HoD)
- Sees all SCIT cases plus department-level reporting.
- Can: approve or reject the Focal Person's grade recommendation (this is the act that awards the grade), counter-sign a restart authorization, counter-sign a waiver recommendation.
- **Cannot:** originate a grade recommendation, originate a restart, act as both signatures on a restart, or edit case data.

### 2.4 Dean
- Read-only across the department, plus exactly two write capabilities: the third signature on a waiver, and the escalation decision when the restart gate denies a request.
- Has no day-to-day role. If the Dean is logging in weekly, something is wrong with the process.

### 2.5 Industry Supervisor (external, no account)
- Receives a signed, single-use, expiring link tied to one case.
- Can: view the student name, company name and internship dates only, and submit the evaluation form once.
- Cannot: see grades, other students, or resubmit after submission (a correction requires the Focal Person to issue a new token, which is audited).

### 2.6 Registrar / Admin
- Operational only: create and deactivate user accounts, import student roster and semester data, open/close semesters, configure deadline dates.
- **Explicitly cannot:** change a case state, change a grade, upload or delete a document, or edit the audit log. There is no "super admin" screen in this system. If an admin needs to fix data, they use a documented, audited maintenance procedure that is itself logged as a case event — not a form.

### 2.7 System
- Performs scheduled actions: eligibility recomputation, deadline sweeps, escalation timers, reminder emails. Every system action writes an audit row attributed to `SYSTEM` with the job name.

---

## 3. Authority matrix

Implement this as a single source of truth (`src/server/authz/matrix.ts`) that both the API layer and the UI read from. The UI must never be the only thing hiding a capability.

| Capability | Student | Focal | HoD | Dean | Admin |
|---|---|---|---|---|---|
| View own case | ✓ | — | — | — | — |
| View any SCIT case | — | ✓ | ✓ | ✓ (read) | — |
| Open case / upload offer letter | ✓ | — | — | — | — |
| Approve or reject offer | — | ✓ | — | — | — |
| Update progress log | ✓ | — | — | — | — |
| Upload completion certificate | ✓ | — | — | — | — |
| Issue supervisor token | — | ✓ | — | — | — |
| Verify a deliverable | — | ✓ | — | — | — |
| Recommend grade | — | ✓ | — | — | — |
| Award grade (final) | — | — | ✓ | — | — |
| Initiate restart request | — | ✓ | — | — | — |
| Counter-sign restart | — | — | ✓ | — | — |
| Escalation ruling on denied restart | — | — | — | ✓ | — |
| Initiate waiver | — | ✓ | — | — | — |
| Counter-sign waiver | — | — | ✓ | — | — |
| Final waiver approval | — | — | — | ✓ | — |
| Manage users / semesters | — | — | — | — | ✓ |
| Edit audit log | — | — | — | — | — |

The last row has no ✓ in any column. That is deliberate and must remain true at the database privilege level, not just in code.

---

## 4. Business rules (the policy, as enforceable statements)

Every rule below carries an ID. Every rule must have a named test. Tests must be named after the rule (`BR07_offer_requires_work_description.test.ts`).

### Eligibility and timing
- **BR-01** A student is eligible only after completing the 4th semester. Eligibility is computed from the roster, never self-declared.
- **BR-02** A student who has not opened a case by the end of the 6th semester is auto-enrolled: the system creates a mandatory case and flags the student's next registration. This is not optional and does not wait for a login.
- **BR-03** A student cannot be marked graduation-eligible without a `CLOSED_PASS` case or an approved waiver.
- **BR-04** The graduation clock is derived from admission semester and is **read-only to every human role**, including Admin. No API route may write to it.
- **BR-05** Each semester (including summer) has a configured document submission deadline. Cases missing deliverables at that deadline are flagged, not auto-failed.

### Case integrity
- **BR-06** A student may have at most one non-terminal case at any time. Enforced by a partial unique index in the database, not only in application code.
- **BR-07** An offer letter submission is invalid without: the offer letter file, the company name, the company contact, and a work description of at least 200 characters.
- **BR-08** Internship duration must be between 4 and 8 weeks (approximately 120–240 hours). The system records planned dates at approval and actual dates at completion, and flags any variance for the Focal Person.
- **BR-09** The internship must be relevant to the degree program. This is a human judgement recorded as a mandatory field on approval, with the reason stored.
- **BR-10** A case cannot enter `PENDING_VERIFICATION` until all three deliverables exist: offer letter, completion certificate, supervisor evaluation.

### Verification and grading
- **BR-11** Each deliverable is verified individually, and each verification requires the verifier to select a **verification method** from a fixed list (`DOCUMENT_INSPECTED`, `EMPLOYER_CONTACTED_PHONE`, `EMPLOYER_CONTACTED_EMAIL`, `SUPERVISOR_LINK_CONFIRMED`) plus an optional note. "Verified" must never mean only "a button was clicked."
- **BR-12** The Focal Person recommends; the HoD awards. The same human account may never perform both actions on one case, even if they hold both roles. Enforced at the service layer by comparing user IDs, not role names.
- **BR-13** Grades are exactly `P` or `I`. No other value may be stored.
- **BR-14** A grade, once awarded, is immutable. Corrections are recorded as a new reversal event with a mandatory reason and a Dean signature — the original row is never updated or deleted.
- **BR-15** A `CLOSED_PASS` case can never be reopened by any role in this system.

### The restart gate
- **BR-16** A restart is reachable only from `CLOSED_INCOMPLETE`. It cannot be reached from any other state.
- **BR-17** Three guards must all pass before a restart is authorized:
  - **G1 — different organization.** The new company must not match the failed case's company. Match check uses normalised name plus registration/NTN where available, with fuzzy matching above a configured threshold flagged for human confirmation. A flagged match requires an explicit override reason from the HoD.
  - **G2 — time remains.** The graduation clock must show at least one full semester (including summer) before the graduation boundary.
  - **G3 — dual sign-off.** The Focal Person and the HoD each sign separately, from separate sessions, each with a mandatory written reason. Two signatures from one account is not a valid pair.
- **BR-18** If any guard fails, the request is `DENIED`. A denied request cannot be resubmitted with the same facts — it escalates to the Dean, whose ruling is final and audited. There is no retry loop.
- **BR-19** A student may be granted at most **`RESTART_CAP`** restarts before graduation. Default this to 1 and make it a configuration value, not a hard-coded literal. On exceeding the cap, the only remaining route is a Dean-level ruling.
- **BR-20** A restart creates a **new linked case**. `previous_case_id` points at the failed case. The failed case remains `CLOSED_INCOMPLETE` forever. History is never rewritten.

### The waiver path
- **BR-21** A waiver is the only route that skips the eight steps entirely. It requires **three signatures**: Focal Person (initiates, with documented exceptional circumstances), HoD (counter-signs), Dean (final approval). Any one of the three refusing ends it.
- **BR-22** Prior work experience alone is never sufficient grounds. The initiating record must state the exceptional circumstance explicitly in a mandatory free-text field of at least 300 characters, and attach supporting documentation.
- **BR-23** At most one waiver per student, ever. Enforced by unique constraint.
- **BR-24** Every waiver is surfaced permanently on the HoD dashboard and in an annual report. Waivers are visible by design — an exception nobody can see becomes a norm.

### Process integrity
- **BR-25** Every state transition is validated against an explicit allowed-transitions table. An unknown transition is a hard error, never a silent no-op.
- **BR-26** Every state change, signature, verification, upload, download and permission denial writes an append-only audit row. The application database role has `INSERT` and `SELECT` on the audit table and no `UPDATE` or `DELETE`.
- **BR-27** Inaction escalates. If a Focal Person leaves an approval or verification pending beyond `SLA_DAYS` (default 10 working days), it escalates automatically to the HoD and is flagged on the dashboard. Nobody can stall a student's case silently.
- **BR-28** If a supervisor has not submitted an evaluation within `SUPERVISOR_SLA_DAYS` (default 14), the system reminds them twice, then flags the case for Focal Person intervention. An unresponsive external party must never be able to freeze a student's academic record indefinitely.

---

## 5. State machine

Implement as a declarative table. No `if/else` chains scattered across services.

### 5.1 States

```
ELIGIBILITY_PENDING
ELIGIBLE
OFFER_SUBMITTED
OFFER_UNDER_REVIEW
OFFER_REJECTED
APPROVED
IN_PROGRESS
DOCS_PENDING
PENDING_VERIFICATION
VERIFIED
GRADE_RECOMMENDED
CLOSED_PASS              (terminal)
CLOSED_INCOMPLETE        (terminal)
WITHDRAWN                (terminal)
RESTART_REQUESTED
RESTART_AUTHORIZED
RESTART_DENIED           (terminal for the request, not the student)
WAIVER_REQUESTED
WAIVER_COUNTERSIGNED
WAIVER_GRANTED           (terminal)
WAIVER_DENIED            (terminal)
```

### 5.2 Transition table shape

```ts
type Transition = {
  from: CaseState;
  to: CaseState;
  actorRole: Role;
  guards: GuardFn[];        // pure predicates, each returns {ok} | {ok:false, reason}
  requiresReason: boolean;
  emitsEvent: EventType;
};
```

Rules:
- A transition executes only if every guard returns ok. A failed guard produces a structured denial that is itself audited.
- The transition executor is the **only** code path in the system permitted to write `cases.state`. Enforce with a database trigger that rejects direct updates to `state` from anything other than the transition function.
- Guards are pure and unit-testable in isolation. No database writes inside a guard.

### 5.3 The restart gate, precisely

```
CLOSED_INCOMPLETE
  --(Focal Person initiates)--> RESTART_REQUESTED
      guards: G1 different org, G2 time remains, G3a focal signature valid,
              G4 restart count < RESTART_CAP
  --(HoD counter-signs, different user ID)--> RESTART_AUTHORIZED
      guards: G3b hod signature valid, G5 signer != focal signer
  --(system)--> creates new case in ELIGIBLE with previous_case_id set

any guard fails --> RESTART_DENIED --> Dean escalation (separate record, final)
```

---

## 6. Technology stack

Use exactly this. Do not substitute. Every choice below is made for auditability, single-language maintenance by a small university team, and clean containerisation.

### 6.1 Application
| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | Long support window |
| Framework | Next.js (App Router) | 15.x | One codebase, server components, server actions |
| Language | TypeScript | 5.x, `strict: true` | No `any` permitted anywhere |
| ORM | Prisma | 6.x | Versioned migrations, typed queries |
| Database | PostgreSQL | 16 | Row-level constraints, triggers, privilege separation |
| Validation | Zod | 3.x | One schema shared by client and server |
| Auth | Auth.js (NextAuth v5) | 5.x | Credentials now, SAML/OIDC to BNU IdP later |
| Password hashing | argon2id | — | Not bcrypt, not SHA |
| Jobs | BullMQ + Redis | 5.x / 7.x | Durable timers for SLA escalation |
| Email | Nodemailer → BNU SMTP relay | — | No third-party mail service holding student data |
| UI | Tailwind CSS + shadcn/ui | — | Accessible primitives, no design debt |
| Tables/forms | TanStack Table, React Hook Form | — | |
| PDF generation | `@react-pdf/renderer` | — | Transcripts, evaluation summaries |
| Testing | Vitest (unit), Playwright (e2e) | — | |
| Linting | ESLint + Prettier + `eslint-plugin-security` | — | |

### 6.2 Infrastructure
| Concern | Choice |
|---|---|
| Container runtime | Docker + Docker Compose v2 |
| Reverse proxy / TLS | Caddy 2 (automatic HTTPS, or internal cert for campus network) |
| Virus scanning | ClamAV container, scanning every upload before it is accepted |
| Backups | `pg_dump` on a cron sidecar, written to a dedicated volume, 30-day retention |
| Logs | JSON to stdout, collected by Docker; audit log is in Postgres, not in log files |
| Monitoring | `/api/health` + `/api/ready` endpoints; optional Uptime Kuma |

### 6.3 Explicitly not used
No third-party analytics. No CDN for authenticated assets. No cloud object storage — file storage is on the server's own disk via a Docker named volume, as required. No client-side-only authorisation.

---

## 7. Modules and build order

Build strictly in this order. Each module depends on the ones before it. Write `/docs/modules/MXX.md` for a module **before** implementing it, containing: purpose, data touched, business rules enforced, API routes, screens, test list, done criteria.

### M00 — Repository and container skeleton
Monorepo layout, Dockerfile (multi-stage, non-root user, distroless or slim runtime), `docker-compose.yml`, `.env.example`, health endpoints, CI script that runs lint + typecheck + tests. **Done when** `docker compose up --build` serves a "hello" page over HTTPS via Caddy from a clean machine.

### M01 — Data model and migrations
All tables, all constraints, all indexes, the audit table with restricted privileges, the state-change trigger, seed script for roles and a test roster. **Done when** every business rule in §4 that can be expressed as a constraint *is* a constraint.

### M02 — Identity, sessions and authorisation
Auth.js setup, argon2 hashing, session handling, the authority matrix module, route-level guards, a `requireCapability()` helper used by every mutating route, brute-force lockout, password reset via email. **Done when** an integration test proves a student's session cannot read another student's case through any route.

### M03 — Roster, semesters and the eligibility engine
Roster import (CSV/XLSX from the registrar), semester configuration, deadline configuration, graduation clock computation, eligibility recomputation job, BR-02 auto-enrolment sweep. **Done when** a student advancing from semester 3 to 4 becomes eligible without human action, and one at semester 6 with no case is auto-enrolled.

### M04 — Case lifecycle core
The state machine table, the transition executor, the database trigger locking `cases.state`, guard framework, event emission. No UI yet. **Done when** every transition in §5 has a passing test and an illegal transition throws.

### M05 — Offer submission and approval
Student submission form (BR-07), file upload pipeline (see M06), Focal Person review queue, approve/reject with mandatory reason, relevance judgement field (BR-09), planned date capture (BR-08). **Done when** an approval cannot be recorded without a reason and a relevance judgement.

### M06 — Document vault
Upload handling: size and MIME validation, magic-byte sniffing, ClamAV scan, SHA-256 checksum stored, UUID filenames, files written to the `scit_uploads` Docker volume **outside the web root**. Downloads served only through an authenticated streaming route that checks capability and logs the access. No document is ever deletable; superseded documents are marked `SUPERSEDED` and retained. **Done when** a direct URL guess returns 404 and every download appears in the audit log.

### M07 — Progress tracker
Replaces the Google Sheet. Student-side progress log, weeks completed, mid-point check-in, actual-vs-planned variance flag (BR-08), Focal Person overview of all in-progress internships. **Done when** the tracking sheet can be retired.

### M08 — Supervisor evaluation
Tokenised links: signed, single-use, expiring, scoped to one case, revocable. Public form with no login exposing only student name, company and dates. Submission locks the token. Reminder schedule and the BR-28 non-response escalation. Focal Person can issue a replacement token, which is audited. **Done when** a used token returns a clean "already submitted" page and a replayed token is rejected.

### M09 — Verification and grading
Per-deliverable verification with mandatory method (BR-11), the three-item checklist gate (BR-10), grade recommendation by Focal Person, grade award by HoD, the same-person block (BR-12), grade immutability and the reversal-with-Dean-signature mechanism (BR-14). **Done when** a user holding both Focal and HoD roles cannot complete both halves on one case.

### M10 — The restart gate
Restart request, the four guards, dual sign-off from separate sessions, denial and Dean escalation, restart cap, linked case creation (BR-16 to BR-20). **Done when** every guard has a passing negative test and no code path creates a second case without passing through the gate.

### M11 — The waiver path
Three-signature workflow, mandatory circumstance narrative and evidence, one-per-student constraint, permanent visibility on the HoD dashboard and annual report (BR-21 to BR-24). **Done when** a waiver cannot be granted with two signatures.

### M12 — Notifications and SLA escalation
Email templates for every status change, BullMQ jobs for reminders, the BR-27 Focal Person SLA escalation, the BR-28 supervisor escalation, digest email for HoD. All email content is templated and versioned — no ad-hoc strings in services. **Done when** an untouched pending approval escalates on schedule in a time-travelled test.

### M13 — Dashboards and reporting
Student case view rendered as the eight-step progress line. Focal Person work queue sorted by SLA risk. HoD department view: counts by state, overdue eligibility, pending verifications, all waivers, all restarts. Dean read-only view. Exports to XLSX and PDF. **Done when** the HoD can answer "who is at risk of not graduating" in one screen.

### M14 — Hardening, backup and handover
Security headers, CSP, rate limiting, CSRF, dependency audit, penetration checklist from §9, backup and restore rehearsal, operator runbook, admin training document. **Done when** a restore from backup into an empty environment reproduces the system exactly.

---

## 8. Deployment

### 8.1 Compose topology

Six services, five named volumes. Everything on an internal Docker network except Caddy.

```yaml
services:
  caddy:      # only service with published ports 80/443
  app:        # Next.js, non-root, no published ports
  worker:     # BullMQ consumer, same image as app, different command
  postgres:   # no published ports
  redis:      # no published ports
  clamav:     # no published ports
  backup:     # cron sidecar running pg_dump

volumes:
  scit_pgdata:      # PostgreSQL data
  scit_uploads:     # all student documents — server storage, never a bind mount
  scit_redis:       # queue durability
  scit_backups:     # pg_dump output, 30-day rotation
  scit_caddy:       # certificates and Caddy state
```

Requirements:
- Named volumes, not bind mounts, for all five. The uploads volume is the server's storage as specified.
- `app` and `worker` run as a non-root UID that owns `/data/uploads` inside the container.
- Every service declares a `healthcheck` and `restart: unless-stopped`.
- `app` waits on `postgres` and `redis` health, not just start.
- Secrets come from an `.env` file with `600` permissions, or Docker secrets. Never committed. Ship `.env.example` with every key and no value.
- The Postgres container publishes no ports. Database access for maintenance is via `docker compose exec`.

### 8.2 Environment variables

Document all of these in `.env.example` with comments:

```
NODE_ENV, APP_URL, SESSION_SECRET
DATABASE_URL, DATABASE_APP_ROLE, DATABASE_MIGRATION_ROLE
REDIS_URL
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
UPLOAD_DIR=/data/uploads
MAX_UPLOAD_MB=10
ALLOWED_MIME=application/pdf,image/jpeg,image/png
CLAMAV_HOST, CLAMAV_PORT
SUPERVISOR_TOKEN_TTL_DAYS=21
SLA_DAYS=10
SUPERVISOR_SLA_DAYS=14
RESTART_CAP=1
MIN_INTERNSHIP_WEEKS=4
MAX_INTERNSHIP_WEEKS=8
COMPANY_MATCH_THRESHOLD=0.85
BACKUP_RETENTION_DAYS=30
```

Two database roles are required: a migration role that owns the schema, and a runtime application role with no DDL rights and no `UPDATE`/`DELETE` on `audit_events`. The app connects as the runtime role.

### 8.3 Operator runbook (write this as `/docs/RUNBOOK.md`)

Cover: first deployment, upgrading (`docker compose pull && docker compose up -d` with migration step), taking a manual backup, restoring from backup, rotating secrets, adding a new academic semester, onboarding a new Focal Person, what to do when ClamAV blocks a legitimate file, and how to read the audit log for a disputed case.

---

## 9. Security requirements

These are acceptance criteria, not suggestions. M14 is not complete until each is demonstrated.

### Data integrity
- The `audit_events` table is append-only at the database privilege level. Prove it by attempting an `UPDATE` as the runtime role and showing the permission error.
- `cases.state` is writable only by the transition function, enforced by trigger. Prove it with a direct `UPDATE` attempt.
- Grades are immutable. Prove it with a direct `UPDATE` attempt and by showing the reversal mechanism instead.
- No API route accepts a client-supplied state, role, grade or user ID for authorisation purposes. Identity comes from the session; target resources come from the URL and are then authorised.
- All timestamps are server-generated `timestamptz`. Client clocks are never trusted.

### Access control
- Every mutating route calls `requireCapability()` before touching data. A route without it fails a CI lint rule — write that rule.
- Resource identifiers are UUIDv7, never sequential integers, so IDs cannot be enumerated.
- Ownership is checked on the row, not inferred from the role. A Focal Person from another department (should SCIT ever share the deployment) sees nothing.
- The UI hides what the API forbids — but the API forbidding it is the control. Test the API directly with a lower-privileged session for every capability in §3.

### Files
- Uploads are validated by extension **and** magic bytes **and** MIME, scanned by ClamAV, then stored under a UUID filename in the volume. The original filename is metadata only and is never used to build a path.
- Path traversal is impossible because filenames are generated, not accepted.
- Downloads stream through an authenticated handler with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- No file is ever deleted. Superseded files are flagged and retained for the retention period.

### Sessions and secrets
- HttpOnly, Secure, SameSite=Lax cookies. Short session lifetime with sliding renewal. Session invalidation on password change and on role change.
- Supervisor tokens are HMAC-signed, single-use, expiring, and stored hashed — the raw token exists only in the email.
- Rate limits on login, password reset, supervisor token submission and file upload.
- Full CSP, HSTS, `X-Frame-Options: DENY`, no inline scripts.

### Privacy
- Students see only their own data. There is no student directory in this system.
- Supervisor-facing pages leak nothing beyond the student's name, the company and the dates.
- Evaluation comments are visible to Focal Person and HoD only, never to the student, unless the department later decides otherwise (make this a config flag, defaulted to hidden).
- Log lines never contain document contents, tokens, passwords or full evaluation text.
- Define a retention policy: case records retained permanently (they are academic records), documents retained per university policy, audit retained permanently.

---

## 10. Design direction

The reference points are modern academic and administrative portals — restrained, legible, institutional. Not a startup dashboard, not a 2010 university intranet.

**Palette** (carry through from the department's process graphic so printed and digital artefacts match):

```
--deep:   #0E3B43   primary, dominant, headers and primary actions
--mid:    #2E7D8F   secondary, progress indicators
--gold:   #D99A2B   accent only: current step, required actions, waiver flags
--ink:    #16262B   body text
--muted:  #5C6F75   secondary text
--tint:   #EFF4F4   surface tint, table striping
--danger: #A32D2D   denials, overdue
--ok:     #1D9E75   verified, passed
```

Use gold sparingly. If more than one thing on a screen is gold, nothing is.

**Typography:** one sans for the interface (Inter or system stack), one serif for page titles and printed documents (Source Serif or Cambria) — this echoes the departmental letterhead register without looking dated. Sentence case everywhere. Never all-caps except small section labels.

**Layout principles:**
- The eight-step progress line is the student's entire home page. It is the same graphic as the departmental poster, rendered live. A student should never wonder what happens next.
- Every case screen shows: current state, who is responsible for the next action, and the deadline. Those three facts are never more than one glance away.
- The Focal Person's queue is sorted by SLA risk, not by date. The thing about to breach is at the top.
- Empty states say what to do, not "no records found."
- Every destructive-looking action (reject, deny) requires a written reason in the same dialog. The reason field is the confirmation.
- Tables over cards for lists. Cards are for single objects.
- Full keyboard operability, visible focus rings, WCAG 2.1 AA contrast, correct heading order, labelled form controls. A university portal is subject to accessibility expectations.
- Responsive down to 360px. Students will use phones to upload certificates.

**Printed artefacts:** case summary PDF, supervisor evaluation PDF, and a department-level annual report PDF, all carrying BNU/SCIT identification and generated server-side.

---

## 11. Testing and acceptance

- **Unit:** every guard, every business rule, both directions.
- **Integration:** every capability in §3 attempted with every role, asserting allow or deny. This matrix is the core of the suite.
- **End-to-end (Playwright):** the happy path start to `CLOSED_PASS`; the incomplete path through the restart gate to a linked case; the waiver path; the supervisor token path including replay.
- **Negative security tests:** IDOR attempts, direct state update, audit update, token replay, path traversal, privilege escalation via role field in request body.
- **Seed data:** a demo dataset with students across semesters 3 to 8, cases in every state, one restart, one waiver, one denied restart.

**Acceptance criteria for handover:** every business rule BR-01 to BR-28 has a passing named test; the §9 checklist is demonstrated live; a backup taken on one machine restores correctly on another; the runbook is complete enough that a new administrator can perform every operational task from it alone.

---

## 12. Open questions — do not guess

Add to `/docs/OPEN_QUESTIONS.md` and get answers before the module that needs them.

| ID | Question | Blocks |
|---|---|---|
| OQ-01 | Exact per-semester document submission deadline dates | M03 |
| OQ-02 | What counts as acceptable verification of a completion certificate — is employer contact required, or is document inspection sufficient? | M09 |
| OQ-03 | Confirm `RESTART_CAP` = 1, or a different number | M10 |
| OQ-04 | Who holds the Dean role in the system, and is there a delegate? | M10, M11 |
| OQ-05 | Will BNU provide an OIDC/SAML identity provider, or do we manage passwords? | M02 |
| OQ-06 | Is the roster imported from an existing SIS, and in what format? | M03 |
| OQ-07 | Document retention period per university policy | M06 |
| OQ-08 | Should students see supervisor evaluation comments? | M08 |
| OQ-09 | Does a waiver appear on the transcript differently from a pass? | M11 |
| OQ-10 | Is this deployment SCIT-only, or will other BNU schools share it (affects tenancy) | M01 |

Implement the most restrictive reading of any unanswered question and mark it `TODO(OQ-xx)` in the code.

---

## 13. First action

Do not write application code yet. In this first session:

1. Create the repository skeleton and the `/docs` files listed in §0.1.
2. Write `/docs/ARCHITECTURE.md` summarising §5, §6 and §8 in your own words — this becomes the file you consult later instead of re-reading this prompt.
3. Write `/docs/modules/M00.md` and `/docs/modules/M01.md` in full.
4. Populate `/docs/OPEN_QUESTIONS.md` from §12.
5. Initialise `/docs/PROGRESS.md` with M00 as the current module.
6. Stop and report: the file tree, and the questions from §12 that block M01.
