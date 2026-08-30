# SCIT Internship Portal — Project Documentation

**School of Computer & Information Technology**
**Beaconhouse National University, Lahore**

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Draft for departmental review |
| Source policy | SCIT Internship Policy (prepared by Zaman Aziz; approved by Prof. Dr Shafat Ahmed Bazaz) |
| Prepared for | Internship Focal Person, SCIT |

---

## 1. Introduction

### 1.1 Purpose

This document specifies a web-based portal that administers the SCIT internship course. It defines scope, roles, functional and non-functional requirements, the data model, the process state machine, the deployment architecture, and the acceptance criteria for handover.

It is written to be read alongside `MASTER_PROMPT.md`, which is the implementation instruction set. This document explains *what and why*; the master prompt specifies *how*.

### 1.2 Background

SCIT requires every student to complete a 3-credit-hour internship before graduation. The process is currently administered through email, a Google Form for supervisor evaluations, and a shared Google Sheet for tracking ongoing internships. That arrangement has three structural weaknesses:

1. **No enforcement.** A student can miss the 6th-semester deadline without the system noticing.
2. **No integrity guarantees.** A shared spreadsheet can be edited by anyone with the link, and there is no record of who changed what.
3. **No visibility.** Neither the Focal Person nor the HoD can answer "which students are at risk of not graduating" without manual reconciliation.

The portal exists to close all three.

### 1.3 Scope

**In scope:** eligibility determination, offer letter submission and approval, progress tracking, document collection, supervisor evaluation, verification, grading, the restart mechanism for Incomplete grades, the waiver mechanism, notifications, reporting, and audit.

**Out of scope:** the university's academic transcript system (the portal exports to it, it does not replace it), student recruitment or job matching, employer relationship management, and payroll or stipend handling.

### 1.4 Definitions

| Term | Meaning |
|---|---|
| Case | One student's single attempt at the internship course, from eligibility to grade |
| Deliverable | One of the three mandatory documents: offer letter, completion certificate, supervisor evaluation |
| Focal Person | The SCIT staff member who administers the internship process |
| Guard | A predicate that must return true before a state transition is permitted |
| Graduation clock | The computed window of semesters a student has remaining before graduation |
| Restart | A new case created after an Incomplete grade, under authorisation |
| Waiver | Exceptional approval to bypass the internship requirement entirely |
| Terminal state | A case state from which no further transition is possible |

---

## 2. Policy basis

Every requirement in this document traces to the SCIT Internship Policy. The mapping is explicit so that a policy change can be traced to the code it affects.

| Policy clause | Requirement |
|---|---|
| Eligible after 4th semester | BR-01 |
| Must enrol by end of 6th semester, else last summer | BR-02 |
| Cannot graduate without a Pass | BR-03 |
| Offer letter submitted to Focal Person with company name and work description | BR-07 |
| Focal Person approval is sufficient | Authority matrix §5, step 4 |
| Duration 4–8 weeks (~120–240 hours) | BR-08 |
| Report submitted each semester including summer | BR-05 |
| Focal Person recommends grade in consultation with HoD | BR-12 |
| Grades are P or I | BR-13 |
| Incomplete requires another internship at a different organisation | BR-16 to BR-20 |
| Internship must be relevant to the degree programme | BR-09 |
| No waiver or substitution with prior work experience except under exceptional circumstances | BR-21 to BR-24 |

Business rule identifiers refer to `MASTER_PROMPT.md` §4.

---

## 3. Stakeholders and roles

### 3.1 Role summary

| Role | Count | Primary responsibility |
|---|---|---|
| Student | ~all SCIT undergraduates | Secure the internship, submit documents, keep progress current |
| Internship Focal Person | 1 (currently Muhammad Ali) | Approve offers, verify deliverables, recommend grades |
| Head of Department | 1 per programme | Award grades, counter-sign exceptions |
| Dean | 1 | Rule on escalations, final signature on waivers |
| Industry Supervisor | Many, external | Submit one evaluation per student |
| Registrar / Admin | 1–2 | Accounts, roster, semester configuration |

### 3.2 Authority design principle

Authority in this system is **enumerated, separated and paired**.

- *Enumerated* — no role has blanket rights. Each capability is granted individually.
- *Separated* — the person who recommends a grade cannot award it. The person who initiates an exception cannot approve it alone.
- *Paired* — every route out of the normal process requires at least two distinct human signatures, and the waiver requires three.

There is deliberately no super-administrator account. The Registrar can create users and configure semesters; they cannot touch a case, a document, a grade or the audit log. This is the single most important design decision in the system and must not be relaxed for convenience during implementation.

---

## 4. Process specification

### 4.1 The normal path

```
1. Check eligibility      System computes from roster; student cannot self-declare
2. Secure internship      Offline; student finds a relevant opportunity
3. Submit offer letter    Student uploads offer letter, company, work description
4. Receive approval       Focal Person approves with a reason and a relevance judgement
5. Conduct internship     4-8 weeks; student maintains the progress log
6. Submit documents       Completion certificate by student; evaluation by supervisor
7. Verify and evaluate    Focal Person verifies each deliverable, recommends a grade
8. Grade awarded          HoD awards P or I; case closes
```

### 4.2 Exception path A — restart after Incomplete

Reachable only from a closed Incomplete case. Four guards, then two signatures from two different people in two different sessions.

| Guard | Check |
|---|---|
| G1 | The proposed company is not the same as the failed case's company |
| G2 | At least one full semester remains before the graduation boundary |
| G3 | Focal Person and HoD have each signed, with written reasons, as distinct accounts |
| G4 | The student's restart count is below the configured cap |

If any guard fails, the request is denied and escalates to the Dean. It cannot be resubmitted on the same facts. A successful restart creates a **new case linked to the failed one**; the failed case remains permanently closed as Incomplete.

### 4.3 Exception path B — waiver

The only route that skips the process entirely, and therefore the most tightly controlled.

- Initiated by the Focal Person with a written statement of the exceptional circumstance (minimum 300 characters) and supporting evidence.
- Counter-signed by the HoD.
- Finally approved by the Dean.
- At most one per student, ever.
- Permanently visible on the HoD dashboard and in the annual report.

Prior work experience alone is explicitly insufficient grounds, per policy. The system records this as a distinct field so that a waiver granted for other reasons cannot later be misread as a work-experience substitution.

### 4.4 Exception path C — withdrawal

A student may withdraw a case before it is approved. This leaves no grade and no record of failure, but is audited and does not reset the graduation clock.

### 4.5 State machine

Twenty states, one declarative transition table, one executor. `cases.state` is writable only by the executor, enforced by a database trigger.

Terminal states: `CLOSED_PASS`, `CLOSED_INCOMPLETE`, `WITHDRAWN`, `WAIVER_GRANTED`, `WAIVER_DENIED`, `RESTART_DENIED`.

Full state list and transition shape: see `MASTER_PROMPT.md` §5.

---

## 5. Functional requirements

### 5.1 Eligibility and enrolment
- **FR-01** Compute eligibility from the registrar roster on a schedule and on roster import.
- **FR-02** Maintain a graduation clock per student, derived from admission semester, read-only to all human roles.
- **FR-03** Auto-create a mandatory case for any student passing the 6th-semester boundary without one, and flag their next registration.
- **FR-04** Block graduation eligibility for any student without a Pass or an approved waiver.

### 5.2 Case management
- **FR-05** Permit at most one non-terminal case per student, enforced by database constraint.
- **FR-06** Accept an offer letter submission only with the file, company name, company contact and a work description of at least 200 characters.
- **FR-07** Record planned internship dates at approval and actual dates at completion, flagging any variance from the 4–8 week window.
- **FR-08** Require a written reason on every approval and every rejection.
- **FR-09** Require an explicit programme-relevance judgement at approval.

### 5.3 Documents
- **FR-10** Accept uploads only after extension, MIME, magic-byte and antivirus validation.
- **FR-11** Store every document under a generated identifier on server storage, outside the web root, with a SHA-256 checksum.
- **FR-12** Serve downloads only through an authenticated route that checks capability and writes an access record.
- **FR-13** Never delete a document; mark superseded versions and retain them.

### 5.4 Progress tracking
- **FR-14** Provide a student-maintained progress log replacing the shared spreadsheet.
- **FR-15** Provide the Focal Person a single view of all in-progress internships with variance and SLA flags.

### 5.5 Supervisor evaluation
- **FR-16** Issue signed, single-use, expiring, case-scoped links to industry supervisors, requiring no account.
- **FR-17** Expose to the supervisor only the student name, company and dates.
- **FR-18** Lock the token on submission; reject replays.
- **FR-19** Send two reminders, then flag the case for intervention if no response within the configured window.
- **FR-20** Permit the Focal Person to issue a replacement token, recorded in the audit log.

### 5.6 Verification and grading
- **FR-21** Verify each of the three deliverables individually, each requiring a selected verification method and optional note.
- **FR-22** Block entry to verification until all three deliverables exist.
- **FR-23** Separate recommendation from award: the same account may never do both on one case.
- **FR-24** Store only `P` or `I` as a grade.
- **FR-25** Make an awarded grade immutable; corrections are recorded as reversal events with a Dean signature.

### 5.7 Exceptions
- **FR-26** Implement the restart gate with all four guards and dual sign-off.
- **FR-27** Implement Dean escalation for denied restarts, with a final, audited ruling.
- **FR-28** Implement the waiver workflow with three signatures and a one-per-student constraint.
- **FR-29** Surface all waivers and restarts permanently on the HoD dashboard.

### 5.8 Notifications and escalation
- **FR-30** Notify the responsible party on every state change.
- **FR-31** Escalate any Focal Person action pending beyond the SLA to the HoD automatically.
- **FR-32** Send the HoD a periodic digest of at-risk cases.

### 5.9 Reporting
- **FR-33** Render each student's case as a live eight-step progress line.
- **FR-34** Provide the Focal Person a work queue sorted by SLA risk.
- **FR-35** Provide the HoD counts by state, overdue eligibility, pending verifications, all exceptions.
- **FR-36** Export to XLSX and generate PDF case summaries and an annual departmental report.

### 5.10 Audit
- **FR-37** Write an append-only audit record for every state change, signature, verification, upload, download, permission denial and system job.
- **FR-38** Attribute every record to a specific account, or to `SYSTEM` with the job name.
- **FR-39** Provide a per-case audit view for the HoD and Dean, sufficient to resolve a disputed grade.

---

## 6. Non-functional requirements

| Category | Requirement |
|---|---|
| Availability | Best-effort campus hosting; graceful degradation if email or antivirus is unavailable — uploads queue rather than fail silently |
| Performance | Any dashboard renders in under 2 seconds for a department of 1,000 students |
| Scalability | Designed for SCIT; the data model supports multi-school tenancy if BNU extends it (see OQ-10) |
| Accessibility | WCAG 2.1 AA; full keyboard operation; responsive to 360px |
| Localisation | English interface; dates in `DD MMM YYYY`; times in Asia/Karachi; all storage in UTC |
| Auditability | Every academic decision reconstructible from the audit log alone |
| Maintainability | Single language (TypeScript), one framework, no bespoke build tooling |
| Portability | Runs from `docker compose up` on any Linux host with Docker installed |

---

## 7. Data model

### 7.1 Core entities

| Entity | Purpose | Key constraints |
|---|---|---|
| `users` | All authenticated accounts | Unique email; role assignments in a separate table |
| `roles` / `user_roles` | Role assignment | A user may hold multiple roles; separation-of-duty is enforced per case, not per role |
| `students` | Roster record | Unique registration number; admission semester; programme |
| `semesters` | Academic calendar | Type (fall/spring/summer), start, end, document deadline |
| `cases` | One internship attempt | `previous_case_id` nullable self-reference; partial unique index on non-terminal states per student |
| `case_events` | State transitions | Append-only; actor, from-state, to-state, reason, timestamp |
| `companies` | Employer record | Normalised name for the different-organisation guard |
| `documents` | Uploaded deliverables | Type, checksum, storage key, status (`ACTIVE`/`SUPERSEDED`), never deleted |
| `verifications` | Per-deliverable verification | Method enum, verifier, note, timestamp |
| `grades` | Awarded grades | Immutable; `P` or `I`; recommender and awarder are distinct |
| `grade_reversals` | Correction mechanism | Reason, Dean signature, points at the original grade |
| `supervisor_tokens` | External access | Hashed token, single-use flag, expiry, case-scoped |
| `evaluations` | Supervisor submissions | One per token |
| `restart_requests` | Exception path A | Guard results, both signatures, outcome |
| `waivers` | Exception path B | Circumstance narrative, evidence, three signatures; unique per student |
| `escalations` | Dean rulings | Subject, reason, ruling, final |
| `audit_events` | Everything | Append-only at the database privilege level |
| `notifications` | Outbound email log | Template version, recipient, sent-at, status |

### 7.2 Integrity mechanisms

Three enforcement layers, in order of authority:

1. **Database.** Partial unique indexes, check constraints, foreign keys, the state-write trigger, and revoked `UPDATE`/`DELETE` on `audit_events` for the runtime role.
2. **Service layer.** The transition executor and its guards. The only code permitted to change a case state.
3. **API and UI.** Capability checks and affordance hiding. Convenience, not security.

A rule expressible as a database constraint must be one. The application layer is not permitted to be the only guardian of any rule in §5.

### 7.3 Identifiers

All externally visible identifiers are UUIDv7. No sequential integer is ever exposed in a URL, so records cannot be enumerated by incrementing an ID.

---

## 8. Architecture

### 8.1 Application stack

Node.js 22, Next.js 15 (App Router), TypeScript in strict mode, Prisma over PostgreSQL 16, Zod validation shared between client and server, Auth.js for sessions with argon2id password hashing, BullMQ over Redis for durable scheduled jobs, Tailwind with shadcn/ui for the interface, Vitest and Playwright for tests.

Full version table: `MASTER_PROMPT.md` §6.

### 8.2 Container topology

Seven services on an internal Docker network. Only the reverse proxy publishes ports.

```
Internet / campus network
        │
    [ caddy ]  :80 :443   TLS termination
        │
    [ app ]               Next.js, non-root
        ├── [ postgres ]  no published ports
        ├── [ redis ]     no published ports
        └── [ clamav ]    upload scanning
    [ worker ]            BullMQ consumer, same image as app
    [ backup ]            pg_dump cron sidecar
```

### 8.3 Storage

All persistent data lives in Docker **named volumes** on the server's own disk. No bind mounts, no cloud object storage.

| Volume | Contents | Backed up |
|---|---|---|
| `scit_pgdata` | PostgreSQL data directory | Yes, via `pg_dump` |
| `scit_uploads` | All student documents | Yes, separate archive |
| `scit_redis` | Job queue durability | No, rebuildable |
| `scit_backups` | Database dumps, 30-day rotation | Off-site copy required |
| `scit_caddy` | TLS certificates and proxy state | No, regenerable |

Documents are written outside the web root and are reachable only through an authenticated streaming route.

### 8.4 Database privilege separation

Two roles. The **migration role** owns the schema and runs migrations during deployment. The **runtime role** used by the application has no DDL rights and holds `INSERT` and `SELECT` — but not `UPDATE` or `DELETE` — on `audit_events`. This is what makes the audit log tamper-evident rather than merely tamper-discouraged.

---

## 9. Security posture

### 9.1 Threat model

The realistic threats to a departmental academic system, in order of likelihood:

| Threat | Control |
|---|---|
| A student views or alters another student's case | Row-level ownership checks; UUID identifiers; API-level capability tests |
| A student forges a completion certificate | Mandatory verification method recorded per document; employer contact option |
| A staff member quietly reopens or alters a closed case | State-write trigger; immutable grades; append-only audit |
| A single staff member unilaterally grants an exception | Dual and triple sign-off with distinct-account enforcement |
| A supervisor link is forwarded and reused | Single-use, expiring, hashed, case-scoped tokens |
| Malware uploaded as a certificate | Magic-byte validation plus ClamAV scanning before acceptance |
| Direct file access by URL guessing | Generated filenames outside the web root; authenticated streaming only |
| Credential stuffing | argon2id, rate limiting, lockout, session invalidation on credential change |
| A case stalls indefinitely because someone did nothing | SLA escalation to the HoD; supervisor non-response escalation |

### 9.2 The no-hidden-mechanism guarantee

The system is designed so that no data change can occur without a corresponding audit record attributable to a person or a named system job. Specifically:

- There is no administrative override screen.
- There is no code path that writes `cases.state` outside the transition executor.
- There is no code path that updates or deletes an audit row; the database refuses it.
- There is no code path that updates a grade; corrections are additive reversal records.
- There is no code path that deletes a document.

M14 acceptance requires demonstrating each of these live, by attempting the forbidden operation and showing the failure.

### 9.3 Privacy

Students see only their own data. There is no student directory. Supervisors see only what they need to complete an evaluation. Evaluation comments default to being hidden from students, configurable if the department decides otherwise. Log output never contains tokens, passwords, document contents or evaluation text.

---

## 10. Delivery plan

Fifteen modules, built in strict order. Each has a written specification, a test list and a definition of done before implementation begins.

| Module | Deliverable | Depends on |
|---|---|---|
| M00 | Repository and container skeleton | — |
| M01 | Data model, migrations, constraints, audit privileges | M00 |
| M02 | Identity, sessions, authority matrix | M01 |
| M03 | Roster, semesters, eligibility engine, graduation clock | M02 |
| M04 | State machine and transition executor | M01 |
| M05 | Offer submission and approval | M04, M06 |
| M06 | Document vault | M02 |
| M07 | Progress tracker | M05 |
| M08 | Supervisor evaluation and tokens | M06 |
| M09 | Verification and grading | M06, M08 |
| M10 | Restart gate | M09 |
| M11 | Waiver path | M09 |
| M12 | Notifications and SLA escalation | M04 |
| M13 | Dashboards and reporting | M09, M10, M11 |
| M14 | Hardening, backup, handover | all |

Module details: `MASTER_PROMPT.md` §7.

### 10.1 Session and progress protocol

The build is expected to run across many working sessions. To keep each session cheap and self-orienting, the repository carries a fixed documentation set:

- `/docs/PROGRESS.md` — current module, last session, build status, where work stopped, next action, blockers. Read at the start of every session; updated at the end of every session; capped at 120 lines.
- `/docs/CONVENTIONS.md` — code style and patterns, read once.
- `/docs/DECISIONS.md` — append-only architectural decision log.
- `/docs/OPEN_QUESTIONS.md` — anything blocked on the department.
- `/docs/modules/MXX.md` — one specification per module.
- `/docs/ARCHITECTURE.md` — the standing reference, so nobody re-reads the master prompt.
- `/docs/RUNBOOK.md` — operator procedures.

No session reads the whole repository. One module per session. This is a hard rule, not a preference.

---

## 11. Testing and acceptance

### 11.1 Test layers

- **Unit** — every guard and every business rule, tested in both directions. Test files named after the rule they defend.
- **Integration** — the full capability matrix: every capability attempted with every role, asserting allow or deny at the API level, not the UI.
- **End-to-end** — the happy path to Pass; the Incomplete path through the restart gate to a linked case; the waiver path; the supervisor token path including a replay attempt.
- **Negative security** — insecure direct object reference, direct state update, audit update, token replay, path traversal, privilege escalation via a role field in a request body.

### 11.2 Acceptance criteria for handover

1. Every business rule BR-01 to BR-28 has a passing, named test.
2. Every control in §9.2 is demonstrated live by attempting the forbidden operation.
3. The full capability matrix passes at the API level.
4. A backup taken on one host restores correctly on a second host.
5. The runbook is complete enough for a new administrator to perform every operational task without assistance.
6. The system runs from a clean `docker compose up --build` with no manual steps beyond populating `.env`.

---

## 12. Open questions

These must be answered by the department before the modules that depend on them.

| ID | Question | Blocks | Owner |
|---|---|---|---|
| OQ-01 | Exact per-semester document submission deadline dates | M03 | Focal Person |
| OQ-02 | What constitutes acceptable verification of a completion certificate | M09 | Focal Person / HoD |
| OQ-03 | Confirm the restart cap (proposed: 1) | M10 | HoD |
| OQ-04 | Who holds the Dean role, and is there a delegate? | M10, M11 | Dean's office |
| OQ-05 | Will BNU provide OIDC/SAML, or does the portal manage passwords? | M02 | BNU IT |
| OQ-06 | Roster source system and export format | M03 | Registrar |
| OQ-07 | Document retention period per university policy | M06 | Registrar |
| OQ-08 | Should students see supervisor evaluation comments? | M08 | HoD |
| OQ-09 | Does a waiver appear on the transcript differently from a pass? | M11 | Registrar |
| OQ-10 | SCIT-only, or shared across BNU schools? | M01 | HoD |

Where a question is unanswered, the implementation adopts the most restrictive interpretation and marks it `TODO(OQ-xx)` in code.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Single Focal Person is a bottleneck and a single point of failure | High | SLA escalation to HoD; role can be assigned to a delegate |
| Employers refuse to use the tokenised evaluation link | Medium | Link requires no account and one page; fallback is a Focal Person-recorded evaluation with method `EMPLOYER_CONTACTED_PHONE`, fully audited |
| Roster data quality drives incorrect eligibility | High | Eligibility recomputed on every import; discrepancies flagged rather than silently applied |
| Strict immutability frustrates staff who are used to editing a spreadsheet | Medium | Training; the reversal mechanism exists precisely so genuine corrections have a legitimate route |
| Server loss | High | Nightly `pg_dump` plus uploads archive to a separate volume, with a required off-site copy and a rehearsed restore |
| Policy changes after build | Medium | Business rules are traced to policy clauses in §2, so a policy change maps directly to the rules and tests it affects |

---

## 14. Appendix — document set

| File | Purpose |
|---|---|
| `MASTER_PROMPT.md` | The implementation instruction set given to the build agent |
| `PROJECT_DOCUMENTATION.md` | This document — specification and rationale |
| `SCIT_Internship_Process_Flow.pptx` | The eight-step departmental process graphic, editable |
| `/docs/ARCHITECTURE.md` | Standing technical reference, written during M00 |
| `/docs/RUNBOOK.md` | Operator procedures, written during M14 |
