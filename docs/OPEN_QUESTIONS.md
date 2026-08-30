# Open questions

Populated from `MASTER_PROMPT.md` §12. Do not guess past these — implement the
most restrictive reading of any unanswered question and mark it `TODO(OQ-xx)`
in the code at the point it matters.

| ID | Question | Blocks | Owner | Status |
|---|---|---|---|---|
| OQ-01 | Exact per-semester document submission deadline dates | M03 | Focal Person | Open |
| OQ-02 | What counts as acceptable verification of a completion certificate — is employer contact required, or is document inspection sufficient? | M09 | Focal Person / HoD | Open |
| OQ-03 | Confirm `RESTART_CAP` = 1, or a different number | M10 | HoD | Open |
| OQ-04 | Who holds the Dean role in the system, and is there a delegate? | M10, M11 | Dean's office | Open |
| OQ-05 | Will BNU provide an OIDC/SAML identity provider, or do we manage passwords? | M02 | BNU IT | Open |
| OQ-06 | Is the roster imported from an existing SIS, and in what format? | M03 | Registrar | Open |
| OQ-07 | Document retention period per university policy | M06 | Registrar | Open |
| OQ-08 | Should students see supervisor evaluation comments? | M08 | HoD | Open — restrictive default applied (hidden), config flag ready |
| OQ-09 | Does a waiver appear on the transcript differently from a pass? | M11 | Registrar | Open |
| OQ-10 | Is this deployment SCIT-only, or will other BNU schools share it (affects tenancy)? | M01 | HoD | Open — restrictive default applied |
| OQ-11 | Is a `Case` auto-created (in `ELIGIBILITY_PENDING`) for every student at admission, or only once eligible/on student action? Arose implementing M03, not in the original §12 list. | M03, M04, M05 | Focal Person / whoever designed the process | Open — restrictive default applied, now with a real implementation behind it |
| OQ-12 | Do the `WAIVER_*` `CaseState` values represent real `cases.state` transitions, or is the waiver workflow entirely independent of any Case row (tracked only via the `waivers` table, as M01 built it)? Arose implementing M04. | M04, M11 | Focal Person / HoD | Open — restrictive default applied |

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
