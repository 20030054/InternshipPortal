#!/bin/sh
# Sets (or rotates) the runtime database role's password from the
# environment. The migration itself creates the "scit_app" role with no
# password (see prisma/migrations/*_init/migration.sql) so no secret is
# ever committed to a version-controlled file — this script is the
# out-of-band step that makes the role able to actually authenticate.
#
# Safe to run repeatedly: ALTER ROLE ... PASSWORD is idempotent, and this
# is also how you rotate the runtime role's password later (see the
# operator runbook, written in M14).
#
# Usage: DATABASE_MIGRATION_ROLE=... DATABASE_APP_ROLE_PASSWORD=... \
#          ./scripts/db/provision-runtime-role.sh
set -eu

: "${DATABASE_MIGRATION_ROLE:?DATABASE_MIGRATION_ROLE is required (connects as the schema-owning role)}"
: "${DATABASE_APP_ROLE_PASSWORD:?DATABASE_APP_ROLE_PASSWORD is required}"

# Piped via stdin rather than -v/-c: psql's :'var' substitution is only
# applied when reading a script, not when the SQL arrives via -c.
psql "$DATABASE_MIGRATION_ROLE" -v ON_ERROR_STOP=1 \
  -v pw="$DATABASE_APP_ROLE_PASSWORD" << 'SQL'
ALTER ROLE scit_app WITH LOGIN PASSWORD :'pw';
SQL

echo "[provision-runtime-role] scit_app password set"
