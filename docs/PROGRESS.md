# Progress

**Current module:** M07 — up next, not started
**Last session:** 2026-08-30
**Build status:** green (`docker compose up --build` succeeds from a clean
volume state; migrations applied against the compose-network Postgres and
`scit_app` provisioned; `/api/ready` returns 200 with database and redis
both `ok: true`; the real ClamAV service (compose's `clamav`, no mock)
scanned a clean file and correctly rejected a genuine EICAR test string
with signature `Eicar-Test-Signature`; `storeDocument()` exercised
directly against the real database and real scanner — two uploads for
the same `(caseId, type)` correctly left the first row `SUPERSEDED` and
the second `ACTIVE`, both physically present on the `scit_uploads`
volume, neither deleted. `pnpm lint`, `pnpm typecheck`,
`pnpm test` [122/122], `pnpm test:integration` [175/175] all pass,
confirmed on two consecutive freshly-recreated temp Postgres/Redis
runs.)

## Completed modules
- [x] M00 Repo + Docker skeleton
- [x] M01 Data model + migrations
- [x] M02 Identity, sessions and authorisation
- [x] M03 Roster, semesters and the eligibility engine
- [x] M04 Case lifecycle core
- [x] M05 Offer submission and approval
- [x] M06 Document vault
- [ ] M07 Progress tracker  <- up next, not started

## Where I stopped
Implemented M06 in full per `/docs/modules/M06.md`: hardened M05's
interim upload writer (`src/server/documents/store.ts`) with magic-byte
sniffing (`src/server/documents/magic-bytes.ts`, hand-written, scoped to
exactly PDF/JPEG/PNG — `ALLOWED_MIME`'s only configured types) and a
real ClamAV scan (`src/server/documents/clamav.ts` +
`clamav-protocol.ts`, a hand-rolled clamd INSTREAM client over
`node:net` rather than a new npm dependency — the protocol is small
enough that hand-rolling it fit this project's already-lean dependency
philosophy better). Added the authenticated streaming download route
(`GET /api/documents/:id/download`, `Content-Disposition: attachment`,
`X-Content-Type-Options: nosniff`, 404 on a direct URL guess or
cross-student access, every attempt — success or denial — audited) and
the completion-certificate upload route
(`POST /api/cases/:id/completion-certificate`, wiring M02's
previously-dead `document.upload_completion_certificate` capability;
creates a `Document` row only, no transition — that's M07's call, not
this module's).

Closed a real gap M05 left open: nothing marked a prior document
`SUPERSEDED` when a new one replaced it, so an offer-letter resubmission
left two `ACTIVE` rows behind. `storeDocument()` now supersedes any
existing `ACTIVE` document of the same `(caseId, type)` in the same
transaction as the new row's insert — applied uniformly across all
three `DocumentType` values as the restrictive default, not just the
two "obviously single-current-file" types (D-040).

BR-10's guard (`DOCS_PENDING -> PENDING_VERIFICATION`) stays
`stubGuard("BR-10")` — M06 gives it two of its three legs' real data
(offer letter, completion certificate) but the third (supervisor
evaluation) has no data model until M08 exists, and a two-thirds-real
guard would still be permanently unreachable in practice (D-042).

Real verification beyond the mocked test suite: the fast integration
suite mocks `scanBuffer()` (a real ClamAV instance isn't available
alongside the temp Postgres/Redis containers this loop already uses,
and its virus-database load takes minutes on first boot) — but the
`docker compose` verification this session exercised the real clamd
protocol against the real `clamav` service, including a genuine EICAR
positive (not a synthetic mock rejection), and confirmed the supersede
logic and the uploads volume directly, not just via Prisma assertions
in a test.

## Next action
Write `/docs/modules/M07.md`, then implement the progress tracker:
student-side progress log, weeks-completed tracking, mid-point check-in,
the actual-vs-planned duration variance flag (BR-08's other half — M05
only checked variance at *approval* against planned dates; M07 compares
against *actual* dates at completion), and a Focal Person overview of
all in-progress internships. M07 is also the natural place to decide
whether/when `IN_PROGRESS -> DOCS_PENDING` (row 8, currently an
unguarded STUDENT transition per M04) should become conditional on
progress-log completeness, and whether uploading the completion
certificate (M06) should auto-advance a case the way M05's offer
submission auto-chains through `OFFER_UNDER_REVIEW` — M06 deliberately
left that transition-triggering question to M07 rather than guessing at
it (see DECISIONS.md D-034's reasoning, extended).

## Blocked on
- OQ-12 (waiver states vs. case transitions) — restrictive default
  applied in M04; M11 (waivers) should confirm or correct this.
- OQ-07 (document retention period) — doesn't block M06/M07, but the
  vault's eventual purge/retention behavior needs a real answer before
  M14's backup/retention story is complete.
- OQ-01 (per-semester document deadlines) — `semesters.document_deadline`
  stays nullable/admin-set until answered; relevant once M07 builds
  deadline-aware flagging (BR-05).
- OQ-06 (roster format) — CSV implemented as the restrictive default;
  XLSX support would be additive if ever needed.
- OQ-05 (BNU OIDC/SAML) — restrictive default applied in M02.
- OQ-10 (tenancy) — restrictive default applied in M01.
