# Admin guide

For the people who use the portal day to day — Focal Person, HoD,
Dean, Admin/Registrar. For standing up, backing up, or troubleshooting
the deployment itself, see `docs/RUNBOOK.md` instead; that's a
different job with a different audience.

---

## The eight-step process, from each role's side

Every case moves through the same eight steps (§1.1). What each role
actually does at each step:

1. **Eligibility** — computed automatically (4+ completed semesters),
   never something a student declares or a Focal Person sets. Nothing
   to do here unless a student believes their eligibility is wrong —
   check `GET /api/students/:id/eligibility` against the roster; if the
   admission semester or a semester's `CLOSED` status looks wrong,
   that's a roster/semester data issue (see "Managing the roster and
   semesters" below), not a case issue.
2. **Offer submission** — the student uploads the offer letter and
   fills in company/dates. Nothing for staff to do until it's
   submitted.
3. **Offer review** — your queue, if you're the Focal Person. Approve
   or reject with a reason (mandatory either way). Rejecting sends the
   student back to resubmit, not a dead end.
4. **Internship in progress** — the student logs weekly progress.
   Nothing for staff to do unless a student stalls; there is no
   escalation for a silent student specifically, only for a
   silent *Focal Person* (BR-27, see "SLA escalations" below).
5. **Completion & documents** — the student uploads the completion
   certificate and requests a supervisor evaluation link (you issue
   the token; the supervisor never gets portal login access, only a
   one-time link).
6. **Verification** — as Focal Person, mark each of the three
   deliverables (offer letter, completion certificate, supervisor
   evaluation) verified once you've actually checked it — document
   inspection, a phone call, an email, or confirming the supervisor
   link themselves all count (BR-11; OQ-02 is still open on whether a
   stricter combination should ever be required).
7. **Grading** — Focal Person recommends a grade (Pass/Incomplete);
   HoD awards it (can differ from the recommendation — it's a real
   second judgement, not a rubber stamp). The same person can never
   recommend and award their own case (BR-12).
8. **Closed** — Pass closes the case for good. Incomplete is the only
   state the restart gate is reachable from.

---

## The restart gate (Incomplete -> a fresh attempt)

Only reachable from `CLOSED_INCOMPLETE`. In order:

1. **Focal Person initiates**, naming the new company. The system
   fuzzy-matches it against the failed attempt's company — an exact
   match is blocked outright (BR-16/G1: it must be a genuinely
   different organisation); a *close* match (above the configured
   similarity threshold but not exact) is flagged, not blocked, and
   needs an explicit HoD override to proceed.
2. **HoD counter-signs** — a second, different person from whoever
   initiated (G5). This also checks the restart cap (G4, default 1 —
   `RESTART_CAP` in `.env`) and that at least one full semester remains
   before the graduation boundary (G2).
3. Any guard failure produces a **denial with a Dean escalation**, not
   a silent block — there is no resubmission on the same facts, only
   the Dean's ruling. The Dean's decision is final.

## The waiver path

The only route that skips the normal eight steps. Focal Person
initiates on the student's behalf with a written circumstance
(exceptional, not "ordinary prior work experience" — BR-22) and
supporting evidence. HoD counter-signs, Dean gives the final ruling.
**A student gets at most one waiver, ever** (BR-23) — there is no
retry if it's denied.

---

## Dashboards

**Student:** the eight-step line as their entire home page — always
shows exactly where their own case stands.

**Focal Person:** a queue of everything waiting on you specifically —
offers to review, deliverables to verify, grades to recommend — plus
the department-wide view below.

**HoD/Dean (department view):**
- Cases awaiting your own action (grade award, restart counter-sign/
  escalation, waiver stages).
- **Overdue eligibility** — students who've been eligible for a while
  with no case opened at all; a real "at risk of not graduating"
  signal, earlier than BR-02's own semester-6 automatic fallback.
- **Deadline missed — flagged, not auto-failed (BR-05).** Once the
  currently *open* semester's document submission deadline has
  passed, any case still missing a deliverable shows up here — and
  every Focal Person gets one email per newly-flagged case
  (deduplicated; you won't get repeated emails for the same case).
  This is a flag for you to follow up on, never an automatic failure —
  nothing in this system ever moves a case to `CLOSED_INCOMPLETE`
  just because a deadline passed.
- **Waivers and restart requests**, both always visible regardless of
  outcome (BR-24: permanent visibility, not just the pending ones).
- An **XLSX export** of the whole department view, for anything you
  need outside the portal.

A student's own **graduation eligibility** (BR-03) — whether they hold
a `CLOSED_PASS` case or an approved waiver, the only two ways to be
graduation-eligible — rides on the same `GET /api/students/:id/
eligibility` response as their semester-count eligibility, as
`isGraduationEligible`. It's computed fresh every time, never a status
you set by hand.

---

## SLA escalations (BR-27, BR-28)

If a case sits waiting on the **Focal Person** for more than
`SLA_DAYS` (default 10 working days, weekends excluded — no public
holiday calendar exists in this build, see OQ-14), every HoD gets an
escalation email. It's a nudge, not a lockout — the Focal Person can
still act on the case.

If an **industry supervisor** hasn't responded to their evaluation
link within `SUPERVISOR_SLA_DAYS` (default 14 days), the Focal Person
gets a reminder, then a second reminder, then — if still unanswered —
an escalation flagging the case for direct Focal Person intervention
(a phone call, typically, since the supervisor has no portal login to
chase them through).

---

## Managing the roster and semesters

CSV roster import and semester open/close/create are Admin-only
(`users.manage`) — see `docs/RUNBOOK.md` §8 for the exact commands.
Two things worth knowing day to day:

- Only one semester is ever `OPEN` at a time — opening a new one
  automatically closes whatever was open before. "Current semester" is
  always this explicit setting, never inferred from today's date.
- A semester's `documentDeadline` is what BR-05's flagging (above)
  keys off. Leave it unset and nothing is ever flagged for that
  semester — there's no fallback guess at a date nobody configured.

---

## Managing staff accounts

Covered in full, with exact commands, in `docs/RUNBOOK.md` §6-7. In
short: an Admin creates a Focal/HoD/Dean/Admin account with an email
and role(s); the new holder gets an email with a one-time link to set
their own password (same mechanism as "forgot password" — there is no
temporary password to relay by phone). Deactivating an account takes
effect immediately, including for a session already open in someone's
browser.

There is no self-registration, and no route to create a Student
account this way — students only ever enter the system via roster
import (§8 above), which also records their registration number and
admission semester, not just an email and a role.

---

## Common questions

**A student says their eligibility is wrong.** It's computed from
`CLOSED` semesters at or after their admission semester — check both
values in the roster, not the student's own claim of "I've done four
semesters." See §1 above.

**ClamAV rejected a legitimate file.** See `docs/RUNBOOK.md` §10 —
there is no override; the fix is always a re-export/re-upload, never
an admin bypass.

**A grade needs to be corrected after the fact.** That's a reversal
(BR-14), not an edit — it needs a Dean signature and is itself a
permanent, visible event, not a silent change. Grades are never
directly editable, by design, at the database privilege level, not
just in the UI.

**Where did that decision/date/number come from, and can we change
it?** Several defaults in this system (the SLA day counts, the restart
cap, the graduation-boundary semester count, evaluation visibility)
are either explicit `.env` configuration or documented open questions
in `docs/OPEN_QUESTIONS.md` — check there before assuming something is
hardcoded and unchangeable.
