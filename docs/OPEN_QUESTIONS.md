# Open questions

Populated from `MASTER_PROMPT.md` §12. Do not guess past these — implement the
most restrictive reading of any unanswered question and mark it `TODO(OQ-xx)`
in the code at the point it matters.

| ID | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| OQ-01 | Exact per-semester document submission deadline dates | M03, M14 | Focal Person | Open — restrictive default applied (M14: unset means never flagged) |
| OQ-02 | What counts as acceptable verification of a completion certificate — is employer contact required, or is document inspection sufficient? | M09 | Focal Person / HoD | Open — restrictive default applied (any single listed method suffices) |
| OQ-03 | Confirm `RESTART_CAP` = 1, or a different number | M10 | HoD | Open — restrictive default (1) now live and enforced by G4 |
| OQ-04 | Who holds the Dean role in the system, and is there a delegate? | M10, M11 | Dean's office | Open — M10's escalation ruling now requires one live `DEAN`-role account; no delegate mechanism exists |
| OQ-05 | Will BNU provide an OIDC/SAML identity provider, or do we manage passwords? | M02 | BNU IT | Open |
| OQ-06 | Is the roster imported from an existing SIS, and in what format? | M03 | Registrar | Open |
| OQ-07 | Document retention period per university policy | M06 | Registrar | Open |
| OQ-08 | Should students see supervisor evaluation comments? | M08 | HoD | Open — restrictive default applied (hidden), config flag ready |
| OQ-09 | Does a waiver appear on the transcript differently from a pass? | M11 | Registrar | Open |
| OQ-10 | Is this deployment SCIT-only, or will other BNU schools share it (affects tenancy)? | M01 | HoD | Open — restrictive default applied |
| OQ-11 | Is a `Case` auto-created (in `ELIGIBILITY_PENDING`) for every student at admission, or only once eligible/on student action? Arose implementing M03, not in the original §12 list. | M03, M04, M05 | Focal Person / whoever designed the process | Open — restrictive default applied, now with a real implementation behind it |
| OQ-12 | Do the `WAIVER_*` `CaseState` values represent real `cases.state` transitions, or is the waiver workflow entirely independent of any Case row (tracked only via the `waivers` table, as M01 built it)? Arose implementing M04. | M04, M11 | Focal Person / HoD | **Resolved in M11** — see resolution log |
| OQ-13 | Confirm the total programme length in semesters used for the graduation boundary (G2/BR-17) — currently 8, inferred only from §15's seed-data hint ("students across semesters 3 to 8"), never stated directly. Arose implementing M10. | M10 | Registrar / HoD | Open — restrictive default applied |
| OQ-14 | Does BNU observe specific public holidays that should pause BR-27's "working days" SLA clock, and what is the weekend (Sat-Sun assumed)? Arose implementing M12. | M12 | HoD / Registrar | Open — restrictive default applied (Sat-Sun weekend only, no holiday calendar) |
| OQ-15 | What should a student withdrawal actually require (a reason, a confirmation step, a notification) — `MASTER_PROMPT.md` §1.2 names withdrawal as one of three exception paths alongside restart and waiver, but never specifies its mechanics the way BR-XX rules do for the other two. Arose implementing M15. | M04 (schema/state machine), M15 (UI) | Focal Person / HoD | **Built in M15** (`case.withdraw`) — see resolution log. The underlying policy question (should it require more than self-service, e.g. a reason or a notification) stays open for a real answer, but is no longer a blocker to using the feature |

## Resolution log

When an answer arrives, move the row's detail here (don't delete the row above — flip Status to `Resolved` and link to this entry) so the reasoning survives even if the table row is later archived.

### OQ-10 — restrictive default applied in M01 (not yet a real answer)

No tenant/school column was added to `User` or `Student` in
`prisma/schema.prisma` — the schema is built SCIT-only per the "implement
the most restrictive interpretation" rule in `MASTER_PROMPT.md` §12.
`TODO(OQ-10)` comments mark both models. Still genuinely open — needs a
real answer from the HoD before assuming this is settled; if BNU ever
extends the deployment, adding the column later is a normal migration
(nullable, backfilled, then constrained), not a rewrite, because entity
boundaries were kept clean of implicit cross-cutting lookups.

### OQ-11 — restrictive default applied in M03

M03 never auto-creates a `Case` for the normal 4-semester eligibility
path — eligibility is a pure computed value (`computeEligibility()`),
and a case only comes into existence via student action (M05, not built
yet) or BR-02's semester-6 fallback sweep (M03, which does create a case
directly, since BR-02's text is explicit and unambiguous where OQ-6 and
the general case-genesis question are not). See `docs/modules/M03.md`
"Scope decisions" for the full reasoning. M04, which owns the actual
state machine and transition table, should confirm or correct this
reading once it exists — if it turns out every student *should* get an
`ELIGIBILITY_PENDING` case at admission, that's an additive change (a
sweep that creates dormant cases early), not a rewrite of what M03
already built.

**Update from M04:** confirmed and kept as-is. M04's transition table
declares `ELIGIBILITY_PENDING → ELIGIBLE` as a real, tested transition
(so the mechanism exists and works), but no code path in this build
calls it — consistent with M03's reading that a case's first appearance
is already past this pair for every path currently implemented (student
action or BR-02's fallback). Still open for a real policy answer; the
transition being defined and tested means answering it later costs
nothing beyond wiring up a caller.

**Update from M05:** that caller now exists. `openCase()`
(`src/server/offers/service.ts`, the `case.open` route) creates the case
in `ELIGIBILITY_PENDING` and immediately calls the transition, backed by
a real BR-01 guard reading M03's `computeEligibility()` — so the normal
path's case genesis is now: student calls `case.open`, which requires
them to already be eligible (computed, never self-declared) or the call
is rejected outright with no row created. This still doesn't answer the
underlying policy question (should *every* student get a dormant
`ELIGIBILITY_PENDING` case at admission, before they're eligible at
all?) — it only answers "once a case exists and eligibility holds, how
does it reach `ELIGIBLE`." Genuinely open; if the answer turns out to be
yes, that's an additive early-creation sweep (mirroring BR-02's), not a
rewrite of `openCase()`.

### OQ-12 — restrictive default applied in M04

M04's transition table has no entry producing any `WAIVER_REQUESTED`/
`WAIVER_COUNTERSIGNED`/`WAIVER_GRANTED`/`WAIVER_DENIED` `cases.state`
value — the waiver workflow (M11) is read as entirely independent of any
Case row, driven through the `waivers` table's own `outcome` field
(`PENDING`/`GRANTED`/`DENIED`) and its three signature timestamps, which
M01 already built keyed to `student_id` directly, with no `case_id` at
all. BR-21's "the only route that skips the eight steps entirely" reads
as consistent with a waiver never requiring a case to exist. The four
enum values stay in `CaseState` for schema completeness — removing them
would be a breaking, disruptive change for no benefit — but nothing in
this build ever sets `cases.state` to one of them. M11 should confirm
this reading before building the waiver routes; if it turns out a
waiver *should* touch an existing case's state (e.g. to mark it
superseded), that's an additive transition-table entry, not a rewrite of
the `waivers` table M01 already built.

**Update from M11 — resolved the other way, on concrete evidence, not a
guess:** a waiver genesis-inserts a real `Case` row directly in
`WAIVER_REQUESTED` and drives it through four new transition-table rows
to `WAIVER_GRANTED`/`WAIVER_DENIED`. Three pieces of pre-existing
evidence, found while building this module, argue against the M04-era
restrictive default: (1) M01's own `cases_one_nonterminal_per_student`
partial unique index already excludes `WAIVER_GRANTED`/`WAIVER_DENIED`
from "non-terminal," alongside `CLOSED_PASS`/`CLOSED_INCOMPLETE`/
`WITHDRAWN`/`RESTART_DENIED` — no reason to hand-carve those two values
out of a real index unless a real row was expected to hold them; (2)
M04's own `TERMINAL_CASE_STATES` (`src/server/state-machine/types.ts`)
already listed both values as dead code, anticipating exactly this; (3)
BR-22's "attach supporting documentation" needs a `Document` row, and
`Document.caseId` is `NOT NULL` — a case-independent waiver would have
had nowhere for the evidence file to live without a schema change this
module didn't need to make. See docs/modules/M11.md "Resolving OQ-12"
for the full reasoning and the four new transition rows.

### OQ-08 — restrictive default applied in M08

`SHOW_EVALUATION_TO_STUDENT` (env var, default `false`) gates
`GET /api/cases/:id/evaluation` for a Student caller — exactly the
interim behaviour `MASTER_PROMPT.md` §9 already specifies ("visible to
Focal Person and HoD only, never to the student, unless the department
later decides otherwise (make this a config flag, defaulted to
hidden)"). This isn't a guess at an unstated default; the master prompt
gave the default. What's still genuinely open is the *policy* question —
should the department ever flip it — which stays with the HoD, not
something this build can answer. Flipping the flag later needs no code
change, just a deployment config edit.

### OQ-02 — restrictive default applied in M09

`deliverablesVerified()`/the `deliverable.verify` route accept any
single one of BR-11's four listed methods (`DOCUMENT_INSPECTED`,
`EMPLOYER_CONTACTED_PHONE`, `EMPLOYER_CONTACTED_EMAIL`,
`SUPERVISOR_LINK_CONFIRMED`) as sufficient for one document, with no
minimum count and no required combination. BR-11 itself only asks for
"a verification method," not a specific one or a set — imposing a
stricter rule (e.g. requiring employer contact specifically for the
completion certificate) would be answering OQ-02 with a guess nobody
has confirmed. Still genuinely open; if the Focal Person/HoD later
settle on a stricter policy (e.g. "employer contact is mandatory for
the completion certificate specifically"), that's a small, additive
change to `deliverablesVerified()`'s fact-gathering, not a rewrite.

### OQ-13 — restrictive default applied in M10

`GRADUATION_BOUNDARY_SEMESTERS = 8` (`src/server/roster/eligibility.ts`)
feeds G2's `semestersRemainingBeforeGraduation()`. `MASTER_PROMPT.md`
never states a total programme length anywhere — the only textual
anchor in the whole document is §15's seed-data line, "students across
semesters 3 to 8," which reads as the intended full range of a normal,
still-enrolled student under a standard 4-year/8-semester BS programme.
This is an inference from a demo-data hint, not a stated fact. A smaller
number would make G2 *harder* to pass (more restrictive for granting a
restart) but would contradict the seed data's own claim that semester 8
is still a normal enrolled semester, not an overrun one — so 8 is both
the only textually-grounded choice available and the appropriately
restrictive one absent a real answer. Still genuinely open; if the
Registrar/HoD confirm a different length (or that it varies by
programme — `Student.programme` already exists as a free-text field,
unused for this), that's a one-line constant change (or a lookup keyed
on `programme`), not a rewrite of G2 itself.

### OQ-14 — restrictive default applied in M12

`workingDaysElapsed()` (`src/server/sla/focal-sla.ts`) treats every day
that isn't Saturday or Sunday as a working day for BR-27's SLA clock —
no BNU public-holiday calendar exists anywhere in this build, and
`MASTER_PROMPT.md` never lists one. Not excluding extra holidays is the
more restrictive reading for BR-27's own purpose: the clock keeps
running through a public holiday, which protects the student (the SLA
breaches sooner, not later), not the Focal Person. The weekend itself
(Saturday-Sunday) is also assumed, not confirmed — a reasonable default
for a contemporary Pakistani university, but genuinely unverified.
Still open; if the HoD/Registrar confirm a real holiday calendar or a
different weekend convention, that's an additive change to
`countWeekendDaysBetween()` (and, for holidays, a small lookup table),
not a rewrite of BR-27's escalation logic itself.

### OQ-01 — restrictive default applied in M14, real dates still needed

`findDeadlineMissedCases()`/`runDeadlineSweep()`
(`src/server/roster/deadline-sweep.ts`, BR-05) treat a semester with no
`documentDeadline` configured as one that can never flag a case — see
`isPastDocumentDeadline()`'s own null check. This is the restrictive
default (never guess at a date nobody set) and means the whole
mechanism is dormant, harmlessly, until the Focal Person actually sets
`documentDeadline` when creating or editing a semester (`docs/RUNBOOK.md`
§8). Still genuinely open: OQ-01 itself asks for the *actual* per-
semester dates, which this module can't answer on its own — but
answering it later needs no code change, only setting the field on
each semester going forward.

### OQ-15 — gap surfaced in M15, no default applied (nothing to guess at)

`src/server/state-machine/transitions.ts` already defines five real,
tested transitions into `WITHDRAWN` (from each pre-approval state,
`actorRole: "STUDENT"`, `emitsEvent: "CASE_WITHDRAWN"`) — M04's schema
and state machine treat withdrawal as a first-class exit, same as
restart and waiver. But unlike restart (M10) and waiver (M11), no
route was ever built to call `executeTransition` with `WITHDRAWN` as
the target, and M15's UI audit (built the UI for every *other*
existing capability, this session) confirmed there's genuinely nothing
to build a form for yet — no capability, no route, no defined input
shape. Unlike OQ-01/OQ-02/etc., this isn't a case of applying the most
restrictive reading of an unanswered question; there's no reasonable
default to apply, because the answer would be new business logic
(does withdrawing require a reason despite `requiresReason: false`?
a confirmation step? a notification to the Focal Person?), not a
missing UI layer over an already-decided rule. Left unbuilt rather
than guessed. Whoever answers this can add one route
(`POST /api/cases/:id/withdraw`, mirroring the shape of
`src/app/api/cases/:id/restart` or `/waiver`) and one `ActionForm`-
backed page; the state machine side needs no change.

**Update — built in M15, same session (D-118, supersedes D-115):**
re-examined during a full "make it fully ready" pass and the framing
above doesn't hold up — every one of the "new business logic"
questions it raised (a reason? a confirmation step? a notification?)
was already answered by M04's own transition table (`requiresReason:
false`, `guards: []`, no notification event beyond the standard audit
log), exactly as precisely as it answers them for every other
transition. What was actually missing was mechanical: a route and a
button, the same gap M15 filled for restart and waiver. Built exactly
as this entry predicted (`POST /api/cases/:id/withdraw`,
`WithdrawCaseButton` on `/cases/:id`) — see D-118 for the full
reasoning and live verification. The genuinely open part — should
withdrawal require *more* than bare self-service, e.g. a reason or a
Focal Person notification, as a matter of real BNU policy rather than
this codebase's own reading — stays open; that's now a UX refinement
on top of a working feature, not a blocker to having one.
