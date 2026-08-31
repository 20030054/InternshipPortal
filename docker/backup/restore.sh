#!/bin/sh
# M14/§9: restores a `pg_dump -F c` custom-format dump (produced by
# backup.sh) into a target database. Deliberately a separate, manual
# script, never run automatically by the backup sidecar's own loop —
# restoring is a deliberate operator action, not something that should
# ever happen unattended. See docs/RUNBOOK.md's "Backup and restore"
# section for the full walkthrough, including the "into an empty
# environment" rehearsal this module's done-criterion names directly.
#
# Usage: restore.sh <dump-file> <target-database-url>
#
# <target-database-url> must point at a database that has already had
# `prisma migrate deploy` run against it at least once — NOT merely "a
# fresh `docker compose up`". A first draft of this comment claimed a
# fresh compose stack alone was enough; that's wrong, caught only by
# actually rehearsing a restore into a truly bare `docker run
# postgres:16-alpine` container (no migration ever applied): `pg_dump`
# never dumps role *definitions*, only GRANT statements that reference
# role names which must already exist — `scit_migrator` comes from
# Postgres's own POSTGRES_USER bootstrap, but `scit_app` is created by
# the init migration's own `CREATE ROLE scit_app` (see
# prisma/migrations/*_init/migration.sql), which only runs via
# `prisma migrate deploy`. Restoring against a target with no
# migration applied fails every GRANT statement in the dump with
# "role scit_app does not exist" (schema/data still restore fine —
# only the trailing privilege statements fail — but don't rely on
# that; migrate first).
set -eu

DUMP_FILE="${1:?Usage: restore.sh <dump-file> <target-database-url>}"
TARGET_URL_RAW="${2:?Usage: restore.sh <dump-file> <target-database-url>}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "[restore] dump file not found: $DUMP_FILE" >&2
  exit 1
fi

# M14: same fix as backup.sh's PG_DUMP_URL — a caller passing
# DATABASE_MIGRATION_ROLE straight from .env (the natural, expected
# usage; see docs/RUNBOOK.md) includes Prisma's own `?schema=public`
# query parameter, which pg_restore/psql (plain libpq, not Prisma)
# reject outright as an unrecognized URI parameter. Stripping it is
# safe here for the same reason it's safe in backup.sh: nothing in
# this schema has ever used anything but the default `public` schema.
TARGET_URL="${TARGET_URL_RAW%%\?*}"

echo "[restore] restoring $DUMP_FILE into $(echo "$TARGET_URL" | sed -E 's#://[^@]+@#://***@#')"

# --clean --if-exists: safe to point at a database that already has
# some (or all) of the schema, not only a truly empty one — drops each
# object before recreating it rather than erroring on the first
# conflict. Ownership and GRANT statements are restored from the dump
# as-is (no --no-owner/--no-privileges), which covers *most* of BR-26's
# privilege posture for free — except one real gap, found only by
# actually rehearsing a full restore end to end and diffing the
# result's live grants against the source's: dropping and recreating
# audit_events/case_events/grades (--clean's DROP TABLE, followed by
# the dump's own CREATE TABLE) re-triggers the init migration's
# standing `ALTER DEFAULT PRIVILEGES ... GRANT ... ON TABLES TO
# scit_app` rule (prisma/migrations/*_init/migration.sql) on each
# newly-recreated table, silently re-granting UPDATE/DELETE on all
# three — the exact privileges BR-26 revokes — before the dump's own
# (narrower) GRANT statement for that table runs. GRANT statements are
# purely additive; a narrower GRANT afterward does not undo a broader
# one a standing default-privileges rule already applied at CREATE
# TABLE time. Confirmed against a real restored database: scit_app had
# INSERT/SELECT/UPDATE/DELETE on audit_events after a plain
# `pg_restore --clean --if-exists`, versus INSERT/SELECT only on the
# live source it was restored from. The three explicit REVOKEs below
# reassert the exact same statements the init migration itself runs,
# making the restore actually match BR-26's guarantee by construction
# — not merely by however the dump's own captured ACL statements
# happened to interact with a standing schema-level rule.
pg_restore \
  --clean \
  --if-exists \
  --dbname="$TARGET_URL" \
  "$DUMP_FILE"

echo "[restore] pg_restore finished; reasserting BR-26's append-only revokes"

psql "$TARGET_URL" -v ON_ERROR_STOP=1 << 'SQL'
REVOKE UPDATE, DELETE ON "audit_events", "case_events" FROM scit_app;
REVOKE UPDATE, DELETE ON "grades" FROM scit_app;
SQL

echo "[restore] done"
