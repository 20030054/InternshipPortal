# Questions for BNU — SCIT Internship Portal

Thirteen open decisions the system currently handles with a safe,
documented default (never a guess passed off as an answer — see
`docs/OPEN_QUESTIONS.md` for the full technical detail behind each
one). None of these block using the system today; each answer just
replaces a default with the department's actual policy, which in every
case is a small, contained change — not a rebuild.

Grouped by who's best placed to answer each one. Feel free to forward
each section separately.

---

## For the Focal Person's office

**1. Document submission deadlines.** Each semester needs an exact
submission deadline for the offer letter / completion certificate /
supervisor evaluation. What are the real dates for the current and
next semester? *(Until set, the system never flags anything as
"missed" for that semester — it doesn't guess a date.)*

**2. Verifying a completion certificate.** Is any one of these enough
on its own — inspecting the document, phoning the employer, emailing
the employer, or confirming via the supervisor's own evaluation link —
or should a specific one (or combination) be mandatory? *(Currently:
any single one suffices.)*

## For the HoD

**3. The restart cap.** A student who fails ("Incomplete") may restart
the internship once, at a different company, subject to sign-off. Is
one restart the right limit, or should it be a different number?
*(Currently: 1.)*

**4. Programme length for the graduation deadline.** The system treats
a student as "out of time to restart" once fewer than one full
semester remains before graduation, assuming an 8-semester (4-year)
programme. Is that the right number for every programme this applies
to, or does it vary? *(Currently: 8, inferred from a seed-data example
in the original spec, never explicitly confirmed.)*

**5. Public holidays and the weekend.** When a case is waiting on the
Focal Person for a decision, an escalation email goes out after 10
working days. Should Saturday-Sunday count as the weekend, and should
any BNU/national holidays pause that clock? *(Currently: Sat-Sun only,
no holiday calendar — the clock runs through any other holiday, which
protects the student by escalating sooner, not later.)*

## For the Dean's office

**6. Who holds the Dean role, and is there a delegate?** Final
restart-denial rulings and final waiver approvals both require a live
account with the Dean role. If the Dean is unavailable, should someone
else be able to act in that capacity? *(Currently: no delegate
mechanism exists — one Dean account is required.)*

## For the Registrar

**7. Roster source and format.** Is the student roster imported from
an existing student information system? If so, what format does it
export (currently only CSV is supported)?

**8. Document retention period.** How long should uploaded documents
(offer letters, completion certificates, waiver evidence) be kept?
*(Currently: forever — nothing is ever deleted, only superseded — but
a real retention/purge policy needs an actual number from university
policy.)*

**9. Waivers on the transcript.** Should a granted waiver appear
differently from a normal Pass on the student's record, or is it
recorded identically? *(Currently the system tracks the two as
genuinely distinct outcomes internally, so answering this is a
reporting/display change, not a data-model change.)*

## For HoD, jointly deciding department policy

**10. Should students see their supervisor's evaluation comments?**
*(Currently: hidden from students by default, per the original spec's
own instruction — this is a single configuration flag, not a rebuild,
if the department decides otherwise.)*

**11. Is this deployment for SCIT only, or will other BNU schools
eventually share it?** Affects whether student/case data ever needs to
be partitioned by department. *(Currently: built SCIT-only.)*

## For BNU IT

**12. Single sign-on.** Will BNU provide an OIDC/SAML identity
provider for login, or should the portal continue managing its own
passwords? *(Currently: self-managed passwords — adding SSO later is
an additive change, not a rewrite.)*

## Already resolved, no action needed

**13.** Whether a "waiver" workflow moves through the same case states
as a normal internship, or is tracked entirely separately — this was
resolved during development (a waiver does get its own real case
record) and needs no further input.
