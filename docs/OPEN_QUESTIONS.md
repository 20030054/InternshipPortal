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
| OQ-08 | Should students see supervisor evaluation comments? | M08 | HoD | Open |
| OQ-09 | Does a waiver appear on the transcript differently from a pass? | M11 | Registrar | Open |
| OQ-10 | Is this deployment SCIT-only, or will other BNU schools share it (affects tenancy)? | M01 | HoD | Open — restrictive default applied |
| OQ-11 | Is a `Case` auto-created (in `ELIGIBILITY_PENDING`) for every student at admission, or only once eligible/on student action? Arose implementing M03, not in the original §12 list. | M03, M04 | Focal Person / whoever designed the process | Open — restrictive default applied |

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
