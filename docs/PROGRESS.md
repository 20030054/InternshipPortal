# Progress

**Current module:** M10 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the full M09 arc — offer letter alone (no advance),
offer letter + completion certificate (still no advance), all three
deliverables via the real M06/M08 routes (auto-advances to
`PENDING_VERIFICATION`), mark-verified rejected with one of two
documents verified then accepted once both are, recommend, a
same-account award attempt correctly rejected with zero orphaned
`Grade` rows, a real HoD award, a Dean reversal, and both `grades` and
`grade_reversals` confirmed append-only at the privilege level —
exercised directly against the real compose-network database, not just
in tests. `pnpm lint`, `pnpm typecheck`, `pnpm test` [168/168],
`pnpm test:integration` [244/244] all pass, confirmed on two consecutive
freshly-recreated temp Postgres/Redis runs.)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [x] M03 Roster, semesters and the eligibility engine
- [x] M04 Case lifecycle core
- [x] M05 Offer submission and approval
- [x] M06 Document vault
- [x] M07 Progress tracker
- [x] M08 Supervisor evaluation
- [x] M09 Verification and grading
- [ ] M10 The restart gate  <- up next, not started

## Where I stopped
Implemented M09 in full per `/docs/modules/M09.md`: every remaining stub
guard in the transition table is now real —
`src/server/grading/checklist.ts`'s pure `deliverablesPresent()`
(BR-10)/`deliverablesVerified()` (BR-11), wired into row 9 (auto-fires
from M06's completion-certificate route and M08's evaluation-submit
route, whichever deliverable arrives last — `advanceToVerificationIfReady()`)
and row 10 (`POST /api/cases/:id/mark-verified`, an explicit Focal
Person action, not auto-chained). `src/server/grading/service.ts`'s
recommend/award/reverse core: `Case.recommendedGradeValue`/
`recommendedBy` (new, nullable) hold the Focal Person's recommendation
between rows 11 and 12/13, since `Grade` itself requires
`recommendedBy` and `awardedBy` simultaneously and can only be created
once, atomically, at award time. The HoD's award accepts its own
`value` — "recommends... awards" read as two independent judgements,
not a rubber stamp.

Two grade-integrity decisions worth flagging: the `Grade` row is only
ever created *after* `executeTransition()` succeeds, not before — a
first draft had this backwards and would have left an orphaned `Grade`
row (blocking every future award attempt, `grades.case_id` being
unique) behind a same-account rejection or any other guard failure,
caught by tracing the failure path before it became a bug report. And
BR-14's reversal mechanism (`POST /api/grades/:id/reverse`) needed a
capability the master prompt's own eighteen-row table doesn't have —
added `grade.reverse` (DEAN) as a nineteenth, a real gap, not an
invented one.

Also closed a small, real hardening gap found while implementing BR-14:
M01 revoked `UPDATE`/`DELETE` on `grades` but never extended the same
append-only treatment to `grade_reversals` — the correction record
whose own integrity BR-14 depends on. Fixed in this module's migration.

## Next action
Write `/docs/modules/M10.md`, then implement the restart gate's
*workflow* around the guards M04 already built for real (G1-G5,
`differentOrganization`/`timeRemains`/`belowRestartCap`/
`distinctSigners`) — dual sign-off from separate sessions, denial and
Dean escalation, the linked-case creation that follows
`RESTART_AUTHORIZED` (a fresh `INSERT` into a new `Case` row with
`previous_case_id` set, the same "genesis insert, not a transition of
the existing row" pattern M03's BR-02 sweep and M04's own reasoning
already established — no transition executor call needed for the new
row itself, only for the old case's `CLOSED_INCOMPLETE → RESTART_
REQUESTED → RESTART_AUTHORIZED` walk, which M04 already wired end to
end). `RestartRequest` (M01) is already built and unused.

## Blocked on
- OQ-12 (waiver states vs. case transitions) — restrictive default
  applied in M04; M11 (waivers) should confirm or correct this.
- OQ-03 (confirm `RESTART_CAP` = 1) — directly relevant to M10; the
  config default (1) is already in place and enforced by `belowRestartCap`
  (M04), but the number itself is still unconfirmed by the HoD.
- OQ-04 (who holds the Dean role, is there a delegate) — relevant to
  M10's escalation path and M11's final waiver signature.
- OQ-02 (completion certificate verification standard) — restrictive
  default (any single listed method) applied in M09.
- OQ-07 (document retention period) — doesn't block M09/M10, but the
  vault's eventual purge/retention behavior needs a real answer before
  M14's backup/retention story is complete.
- OQ-08 (evaluation visibility to students) — restrictive default
  (hidden) applied in M08, exactly as the master prompt specified.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered.
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
