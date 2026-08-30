# Decisions

Append-only. Never edit or delete a past entry — if a decision is reversed,
add a new entry that says so and links back to the one it supersedes. Newest
at the bottom.

---

### D-001 — 2026-08-30 — Docs-only first session, no application code

**Decision:** Session 1 creates only the `/docs` skeleton (`PROGRESS.md`,
`CONVENTIONS.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md`, `ARCHITECTURE.md`,
`modules/M00.md`, `modules/M01.md`). No Dockerfile, no `package.json`, no
source code.

**Why:** `MASTER_PROMPT.md` §13 explicitly says "Do not write application
code yet" for the first session, and §0.2 mandates one module per session.
Writing code before M00 has a spec would violate both.

---

### D-002 — 2026-08-30 — Single-app repo layout, not a workspace monorepo

**Decision:** One Next.js application at the repo root (`/src`, `/prisma`,
`/tests`), not a pnpm/turborepo workspace with separate packages.

**Why:** There is exactly one deployable unit (the `app` image; `worker` is
the same image with a different start command per §8.1). A workspace tool
buys nothing here and adds config surface a small team would have to
maintain. If a genuinely separate package emerges later (e.g. a shared
types package consumed by something outside this repo), revisit.

---

### D-003 — 2026-08-30 — pnpm as package manager

**Decision:** Use pnpm for dependency management and scripts.

**Why:** Strict node_modules resolution catches phantom dependencies early,
faster CI installs via its content-addressable store, single lockfile. Not
mandated by `MASTER_PROMPT.md` §6 (which is silent on package manager); this
is a build-tooling choice within the stack it does specify.

---

### D-004 — 2026-08-30 — Capabilities named as `verb.object` strings, not role checks

**Decision:** The authority matrix (`src/server/authz/matrix.ts`, to be
built in M02) is keyed by capability strings like `offer.approve`,
`grade.award`, `restart.countersign`, never by role name in calling code.

**Why:** `MASTER_PROMPT.md` §2 and §3 are explicit that authority is
"enumerated, not inherited" and that a route checks a capability, not a
role — this makes that structurally hard to violate, since there is no
`if (role === 'FOCAL')` pattern available to reach for.

---

### D-005 — 2026-08-30 — Conventional commits, one module's work per commit series

**Decision:** Commit messages follow Conventional Commits
(`feat(m05): ...`), and a module's implementation lands as one commit or a
short series that corresponds to the `/docs/PROGRESS.md` "Completed
modules" checkbox flipping.

**Why:** Makes `git log` a second, cheaper index into what happened per
module without needing to re-read `PROGRESS_ARCHIVE.md`, consistent with
the token-discipline goal in §0.2.
