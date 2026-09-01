# Operator runbook

Written per `MASTER_PROMPT.md` §8.3 and M14's own done-criterion: a new
administrator should be able to perform every operational task below
using only this document. It assumes a shell on the deployment host,
`docker` and `docker compose` installed, and this repository checked
out at `/opt/scit-internship-portal` (adjust paths if yours differs).

For what each service is and why, see `docs/ARCHITECTURE.md` §3. For
the full security posture and how each item is proven, see
`docs/SECURITY_CHECKLIST.md`. For day-to-day use of the portal itself
(not infrastructure), see `docs/ADMIN_GUIDE.md`.

---

## 1. First deployment

1. Copy `.env.example` to `.env` and fill in every value — see the
   comments in that file for what each one means. In particular:
   - `SESSION_SECRET`: generate with `openssl rand -base64 48`.
   - `POSTGRES_PASSWORD` / `DATABASE_MIGRATION_ROLE`: the migration
     role's own credentials (`DATABASE_MIGRATION_ROLE` is the full
     connection string, e.g.
     `postgresql://scit_migrator:<POSTGRES_PASSWORD>@postgres:5432/scit_internship`).
   - `DATABASE_APP_ROLE_PASSWORD`: a **different** password for the
     restricted runtime role, `scit_app`. `DATABASE_URL` is that
     role's connection string
     (`postgresql://scit_app:<DATABASE_APP_ROLE_PASSWORD>@postgres:5432/scit_internship`).
   - `APP_URL`: the real hostname the portal will be served at (e.g.
     `internship.scit.bnu.edu.pk`). Caddy uses this for automatic
     HTTPS. On a campus-network-only deployment with no public DNS,
     see the comment at the top of `Caddyfile` for the `tls internal`
     alternative.
   - Set file permissions on `.env` to `600` — it holds every secret
     this deployment has.
2. Bring up the database and Redis first, so migrations have
   something to apply to:
   ```
   docker compose up -d postgres redis
   ```
3. Build a one-off **migrator** image and apply the schema. The `app`/
   `worker` runtime image deliberately does not carry `prisma/`, `pnpm`,
   or a package manager at all (a lean, dependency-free runtime — see
   `Dockerfile`'s own comment on why); the `builder` stage does have
   all three, so that stage is what actually runs migrations, not the
   `app` service itself:
   ```
   docker build --target builder -t scit-migrator .
   docker run --rm --network <project>_default --env-file .env \
     scit-migrator pnpm exec prisma migrate deploy
   ```
   (`<project>` is this directory's own name by default — check with
   `docker network ls | grep default` if unsure. The migrator image
   only needs rebuilding when the schema itself changes; keep it
   around for step 4 and for §4/§5's restore procedure below.)
4. Provision the runtime role's password — the migration creates
   `scit_app` with no password set (see
   `scripts/db/provision-runtime-role.sh`'s own comment for why).
   That script itself needs `psql`, which neither the runtime nor the
   migrator image carries (only `postgres`/`backup`, both built on
   `postgres:16-alpine`, have it) — run the equivalent statement
   directly against `postgres`'s own bundled client instead:
   ```
   docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "ALTER ROLE scit_app WITH LOGIN PASSWORD '<DATABASE_APP_ROLE_PASSWORD from .env>';"
   ```
5. Seed the fixed lookup data (the five roles, and — for local/staging
   only — demo accounts and sample students; see `prisma/seed.ts`'s
   own comment on what it does and does not create). **On a real
   production deployment, review `prisma/seed.ts` first** — it is
   written for demo/dev convenience, and you likely want to seed only
   the five `Role` rows, not the demo `User`/`Student` fixtures. Note
   `NODE_ENV=production` (set in `docker-compose.yml` for `app`/
   `worker`, but *not* implied here — this runs via the standalone
   migrator image) makes the seed skip setting any password on the
   demo staff accounts even if you do seed them; step 7 below covers
   getting a first real, working login either way:
   ```
   docker run --rm --network <project>_default --env-file .env \
     scit-migrator pnpm exec tsx prisma/seed.ts
   ```
6. Bring up everything else:
   ```
   docker compose up -d
   docker compose ps
   ```
   Every service should reach `healthy`. `caddy` depends on `app`
   being healthy first, so give it a minute.
7. Create the first real Admin account. There is no bootstrap
   "first admin" flow, and — as step 5 notes — even a seeded demo
   `ADMIN` account has no password set in production, so either path
   below ends the same way. If `prisma/seed.ts` ran with the demo
   fixtures, its `admin@example.scit.test` account already exists;
   otherwise insert the very first `ADMIN` account directly (a
   one-time exception — every subsequent account goes through §6,
   once this one exists to create them):
   ```
   docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
     "INSERT INTO users (id, email) VALUES (gen_random_uuid(), 'admin@example.edu') RETURNING id;"
   docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
     "INSERT INTO user_roles (user_id, role_id) SELECT '<user-id-from-above>', id FROM roles WHERE name = 'ADMIN';"
   ```
   Either way, this account has no password yet: use the portal's own
   "forgot password" flow at `/login` to set one (needs `SMTP_HOST`
   etc. in `.env` actually pointing at a reachable relay — see
   §12 if the email never arrives).
8. Verify: `curl https://<APP_URL>/api/health` returns `200`, and a
   login at `/login` (after setting a password per step 7) succeeds.

---

## 2. Upgrading to a new version

```
git -C /opt/scit-internship-portal pull
docker compose build
docker build --target builder -t scit-migrator .
docker run --rm --network <project>_default --env-file .env \
  scit-migrator pnpm exec prisma migrate deploy
docker compose up -d
docker compose ps
```

(See §1 step 3 for why migrations run via a separately-built
`builder`-stage image rather than `docker compose run app ...` — the
runtime image the `app`/`worker` services actually use has neither
`prisma/` nor a package manager.)

`prisma migrate deploy` is safe to run on every upgrade whether or not
this release added a migration — it's a no-op against an already
up-to-date schema. Never run `prisma migrate dev` against production;
that command is for local schema-authoring only.

---

## 3. Taking a manual backup

The `backup` service already does this automatically on a schedule
(`BACKUP_INTERVAL_SECONDS`, default hourly, retained for
`BACKUP_RETENTION_DAYS`, default 30 — see `docker/backup/backup.sh`).
To take one on demand (e.g. immediately before an upgrade), invoke
`pg_dump` directly the same way the sidecar's own `dump_once()`
function does — running `backup.sh` itself via `exec` would start a
second copy of its infinite loop inside the already-running container,
not a single one-off dump:

```
docker compose exec backup sh -c \
  'pg_dump "${DATABASE_MIGRATION_ROLE%%\?*}" -F c -f "/backups/scit_manual_$(date -u +%Y%m%d_%H%M%S).dump"'
```

(The `%%\?*` strip is the same fix `backup.sh` itself applies
internally — see `docs/DECISIONS.md` D-099: `DATABASE_MIGRATION_ROLE`
carries Prisma's own `?schema=public` suffix, which `pg_dump` rejects
outright as an unrecognized URI parameter if passed through as-is.)

List existing backups:

```
docker compose exec backup ls -lh /backups
```

They live in the `scit_backups` named volume — back that volume up to
somewhere off this machine too (a local disk backup is not a disaster
recovery plan by itself).

---

## 4. Restoring from a backup

**This is a destructive operation on the target database.** Follow
§5 below first to rehearse it against a throwaway database if you
have never done this before.

1. Copy the desired `.dump` file out of the `scit_backups` volume if
   restoring onto a different machine:
   ```
   docker compose cp backup:/backups/scit_20260830_120000.dump ./scit_20260830_120000.dump
   ```
2. On the target machine, get the dump file into the `backup`
   container (skip if restoring in place):
   ```
   docker compose cp ./scit_20260830_120000.dump backup:/backups/
   ```
3. **The target must have had `prisma migrate deploy` run against it
   at least once already** — `pg_dump` never dumps role *definitions*,
   only `GRANT` statements referencing role names (`scit_app`) that
   the init migration creates, not Postgres's own bootstrap. Restoring
   in place onto this same deployment's already-migrated database
   already satisfies this; restoring onto a genuinely fresh target
   (disaster recovery onto new hardware) needs §1 steps 2-4 run first.
4. Run the restore. `docker/backup/restore.sh` takes the dump file and
   a target connection string — normally `$DATABASE_MIGRATION_ROLE`,
   the same role that owns the schema:
   ```
   docker compose exec backup restore.sh \
     /backups/scit_20260830_120000.dump "$DATABASE_MIGRATION_ROLE"
   ```
   `restore.sh` uses `pg_restore --clean --if-exists`, so it's safe to
   point at a database that already has some or all of the schema —
   it drops each object before recreating it. It also reasserts
   BR-26's append-only revokes (`UPDATE`/`DELETE` on `audit_events`/
   `case_events`/`grades`) as an explicit final step — see the
   script's own comments and `docs/DECISIONS.md` D-100 for why that's
   necessary and not redundant: dropping and recreating those tables
   re-triggers a standing default-privileges rule that re-grants both,
   and a plain `pg_restore` alone does not undo that.
5. Restart the app and worker so they pick up any schema/data change
   cleanly:
   ```
   docker compose restart app worker
   ```
6. Verify: log in, open a known case, confirm its data matches what
   you expect from the backup's point in time.

---

## 5. Rehearsing a restore into an empty environment

Do this at least once before you ever need it for real, and repeat it
whenever the schema changes meaningfully. It proves the backup is
actually restorable, not just present on disk — this exact procedure
is what M14 itself was verified against, and caught two real bugs in
`restore.sh` (see `docs/DECISIONS.md` D-099/D-100) that no amount of
reading the script would have found.

```
# A second, throwaway Postgres — not part of this deployment's compose
# stack, joined onto its network directly so both the migrator image
# and the `backup` container can reach it by name (simpler than
# publishing a port and going back out through the host).
NETWORK=$(docker network ls --filter name=_default --format '{{.Name}}' | head -1)
docker run -d --name scit_restore_rehearsal --network "$NETWORK" \
  -e POSTGRES_USER=scit_migrator -e POSTGRES_PASSWORD=rehearsal \
  -e POSTGRES_DB=scit_internship postgres:16-alpine

# Apply migrations to it first — required (§4 step 3): a bare Postgres
# container has no scit_app role until this runs.
docker run --rm --network "$NETWORK" \
  -e DATABASE_MIGRATION_ROLE="postgresql://scit_migrator:rehearsal@scit_restore_rehearsal:5432/scit_internship" \
  scit-migrator pnpm exec prisma migrate deploy

# Restore the real backup into it.
docker compose exec backup restore.sh \
  /backups/scit_20260830_120000.dump \
  "postgresql://scit_migrator:rehearsal@scit_restore_rehearsal:5432/scit_internship"

# Spot-check: row counts should match the source exactly (not just be
# "non-zero") — compare against the same query run on the real
# deployment's own database. Also confirm BR-26 held: scit_app must
# still be rejected attempting an UPDATE on audit_events.
docker exec scit_restore_rehearsal psql -U scit_migrator -d scit_internship -c \
  "SELECT count(*) FROM cases; SELECT count(*) FROM students; SELECT count(*) FROM users;"
docker exec scit_restore_rehearsal psql -U scit_app -d scit_internship -c \
  "UPDATE audit_events SET event_type = 'TAMPERED';"
# ^ this must fail with "permission denied for table audit_events" —
# if it succeeds, something in restore.sh (or a future edit to it) has
# regressed D-100's fix.

# Tear down.
docker rm -f scit_restore_rehearsal
```

---

## 6. Onboarding a new staff account (Focal Person, HoD, Dean, or Admin)

There is no self-registration. An existing Admin creates the account;
the new holder sets their own password via a one-time link.

1. An Admin, signed in, calls:
   ```
   curl -X POST https://<APP_URL>/api/admin/users \
     -H "Content-Type: application/json" -b "<admin's session cookie>" \
     -d '{"email": "new.focal@bnu.edu.pk", "roles": ["FOCAL"], "fullName": "Jane Doe"}'
   ```
   `roles` accepts any of `FOCAL`, `HOD`, `DEAN`, `ADMIN` (one account
   can hold more than one). **Not** `STUDENT` — students are created
   in bulk via roster import (§8 below), which also creates the
   linked academic record this route has no way to collect.
2. The new account receives an email (via the configured SMTP relay)
   with a one-time link, valid for 1 hour, to set their password —
   the same mechanism as "forgot password." No password exists until
   they use it; the account cannot log in before then.
3. If the link expires before they use it, they can request a fresh
   one themselves from `/login` -> "Forgot password?", using the same
   email address — it works identically for a brand-new account as
   for a normal password reset.

Student accounts are never created this way — see §8.

---

## 7. Deactivating a staff account

```
curl -X POST https://<APP_URL>/api/admin/users/<user-id>/deactivate \
  -b "<admin's session cookie>"
```

Takes effect immediately, including for a session already open in a
browser: `disabledAt` is checked on every single request (not just at
login), so a currently-signed-in user is signed out on their very next
action, not merely blocked from a future login. There is no
"reactivate" route — matching §2.6's own wording, this system only
promises "create and deactivate," not a full account lifecycle;
create a fresh account if someone genuinely needs to come back.

---

## 8. Roster import and semester management

**Importing students** (CSV; columns documented in
`src/server/roster/csv-import.ts`'s own header comment — at minimum
registration number, email, programme, admission semester):

```
curl -X POST https://<APP_URL>/api/admin/roster/import \
  -b "<admin's session cookie>" -F "file=@roster.csv"
```

**Creating a semester** (`documentDeadline` backs BR-05's missed-
deliverable sweep — see `docs/ADMIN_GUIDE.md` — and can be omitted if
not yet decided, in which case nothing is ever flagged for it):

```
curl -X POST https://<APP_URL>/api/admin/semesters \
  -H "Content-Type: application/json" -b "<admin's session cookie>" \
  -d '{"type": "FALL", "year": 2026, "startsOn": "2026-09-01", "endsOn": "2026-12-31", "documentDeadline": "2026-12-15"}'
```

**Changing a semester's deadline later** (OQ-01: the deadline set at
creation isn't final — change it, or clear it back to unset, any time
regardless of the semester's status):

```
curl -X POST https://<APP_URL>/api/admin/semesters/<semester-id>/deadline \
  -H "Content-Type: application/json" -b "<admin's session cookie>" \
  -d '{"documentDeadline": "2027-01-15"}'
# omit the field (-d '{}') to clear it back to unset
```

**Opening/closing a semester** ("current semester" is always explicit
admin action, never inferred from today's date — see
`docs/DECISIONS.md` D-020):

```
curl -X POST https://<APP_URL>/api/admin/semesters/<semester-id>/open -b "<admin's session cookie>"
curl -X POST https://<APP_URL>/api/admin/semesters/<semester-id>/close -b "<admin's session cookie>"
```

Opening a semester automatically closes whichever one was previously
open (at most one `OPEN` semester ever exists, enforced by a database
constraint, not just application logic).

---

## 9. Rotating secrets

**`SESSION_SECRET`:** generate a new value (`openssl rand -base64
48`), update `.env`, `docker compose up -d app worker`. This
immediately invalidates every existing session (a JWT signed with the
old secret no longer verifies) — every user is signed out and must log
in again. Password hashes are unaffected.

**`DATABASE_APP_ROLE_PASSWORD`** (the runtime role's password): update
`.env`, then re-run the same statement used at first deploy (§1 step
4):
```
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "ALTER ROLE scit_app WITH LOGIN PASSWORD '<new DATABASE_APP_ROLE_PASSWORD>';"
docker compose up -d app worker
```
(`ALTER ROLE ... PASSWORD` is idempotent — safe to run any time, not
just at first deploy. `scripts/db/provision-runtime-role.sh` runs the
identical statement and is fine to use instead **from a machine that
has `psql` installed** — none of this project's own Docker images
do except `postgres`/`backup`, both `postgres:16-alpine`-based, which
is why the command above goes through `postgres` directly.)

**SMTP credentials:** update `SMTP_USER`/`SMTP_PASS` in `.env`,
`docker compose up -d app worker`.

**A user's own password:** they use "forgot password" at `/login`, or
an Admin deactivates the account (§7) and creates a fresh one (§6) if
the account itself is compromised, not just the password.

---

## 10. When ClamAV blocks a legitimate file

Every upload (offer letter, completion certificate, waiver evidence)
is scanned; a positive match is rejected outright with no override in
the UI, by design (§9: "fail closed"). If a legitimate file is
blocked:

1. Confirm it's a false positive, not a real issue — scan the same
   file locally with a second engine if there's any doubt before
   treating ClamAV as wrong.
2. Check the `clamav` service's own logs for which signature matched:
   ```
   docker compose logs clamav --tail 100
   ```
3. If it's confirmed to be a false positive (ClamAV's signature
   database does occasionally misfire on legitimate PDFs with unusual
   embedded content), the student/Focal Person re-exports or
   re-scans the source document (e.g. re-saving a PDF from its
   original source often changes just enough of its byte layout to
   clear a heuristic match) and re-uploads. There is no
   "admin override to accept an infected-flagged file" — the master
   prompt's own fail-closed requirement (§9, D-039) means this is not
   configurable, deliberately.
4. If the same file keeps triggering across multiple independent
   scans and you're confident it's a false positive, that's a
   ClamAV signature-database issue worth reporting upstream (to
   ClamAV's own project), not something this deployment can suppress.

---

## 11. Reading the audit log for a disputed case

There is no audit-log screen (§2.6: "there is no super admin screen in
this system"). Query it directly:

```
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT ae.created_at, ae.event_type, ae.actor_user_id, u.email AS actor_email,
         ae.system_job, ae.metadata
  FROM audit_events ae
  LEFT JOIN users u ON u.id = ae.actor_user_id
  WHERE ae.entity_type = 'case' AND ae.entity_id = '<case-id>'
  ORDER BY ae.created_at ASC;
"
```

For the state-machine history specifically (every transition this
case actually went through, with its guard-check outcome):

```
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT created_at, from_state, to_state, actor_user_id, reason
  FROM case_events
  WHERE case_id = '<case-id>'
  ORDER BY created_at ASC;
"
```

Both tables are append-only at the database privilege level (`scit_app`
has `INSERT`/`SELECT` only — `UPDATE`/`DELETE` are revoked; see
`docs/SECURITY_CHECKLIST.md`), so what this query returns is guaranteed
to be the complete, untampered history — there is no code path,
authorized or not, that could have edited or removed a row after the
fact.

---

## 12. Troubleshooting

**A service won't report healthy:**
```
docker compose ps
docker compose logs <service> --tail 100
```
`postgres`/`redis` unhealthy almost always means a bad password in
`.env`. `app`/`worker` unhealthy after those two are healthy usually
means a migration hasn't been applied yet (§1 step 3) or
`DATABASE_URL`'s password doesn't match what `scit_app` was actually
provisioned with.

**Login fails for everyone after a deploy:** check
`SESSION_SECRET` didn't change accidentally between the old and new
`.env` — that would invalidate every session at once (see §9).

**A backup dump is suspiciously small:** `docker compose exec backup
sh -c 'du -h /backups/*.dump'` and compare against the previous day's
size — a dump an order of magnitude smaller than usual usually means
`DATABASE_MIGRATION_ROLE` pointed at the wrong database, not that data
actually shrank.
