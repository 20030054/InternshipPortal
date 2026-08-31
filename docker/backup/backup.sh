#!/bin/sh
# M14/§9: the real backup loop — M00's placeholder ("TODO(M01): once
# prisma/schema.prisma exists, replace the echo below with a real
# pg_dump") was never actually replaced by M01 or any module through
# M13; a real gap found auditing for this module's own done-criterion.
# See docs/modules/M14.md and docs/RUNBOOK.md's "Backup and restore"
# section for the paired restore procedure.
set -eu

INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-3600}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_DIR="/backups"

# M14: a second real bug found in the same live-verification pass as
# the /backups permission fix (see docker/backup/Dockerfile) —
# DATABASE_MIGRATION_ROLE, as .env.example documents it and as
# `prisma migrate deploy` actually needs it, carries Prisma's own
# `?schema=public` query parameter. `pg_dump`/`pg_restore` (plain
# libpq client tools, not Prisma) reject that as an unrecognized URI
# parameter outright — every scheduled dump failed with
# `invalid URI query parameter: "schema"` from first start, exactly
# as silently as the permission bug it was stacked behind. Stripping
# everything from the first `?` onward gives libpq a connection string
# it accepts; dropping the parameter is safe here specifically because
# this schema has never used anything but the default `public` schema
# (see prisma/schema.prisma — no `@@schema` on any model).
PG_DUMP_URL="${DATABASE_MIGRATION_ROLE%%\?*}"

log() {
  echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1"
}

dump_once() {
  timestamp="$(date -u +%Y%m%d_%H%M%S)"
  target="${BACKUP_DIR}/scit_${timestamp}.dump"
  log "starting pg_dump -> ${target}"
  # Custom format (-F c): compressed, and the only format pg_restore
  # (not psql) can selectively/parallel-restore from — see
  # docker/backup/restore.sh.
  if pg_dump "${PG_DUMP_URL}" -F c -f "${target}"; then
    size="$(du -h "${target}" | cut -f1)"
    log "pg_dump succeeded: ${target} (${size})"
  else
    log "pg_dump FAILED — removing any partial file"
    rm -f "${target}"
    return 1
  fi
}

prune_old() {
  log "pruning dumps older than ${RETENTION_DAYS} days"
  find "${BACKUP_DIR}" -name 'scit_*.dump' -mtime "+${RETENTION_DAYS}" -print -delete
}

log "backup loop started (interval=${INTERVAL_SECONDS}s retention=${RETENTION_DAYS}d)"

while true; do
  # A single failed dump must never kill the sidecar (restart: unless-
  # stopped would just loop-crash it) — log and try again next interval.
  # No heartbeat file to touch here (M14 removed it): docker-compose.yml's
  # healthcheck now looks directly for a recent *.dump file in
  # BACKUP_DIR instead — the previous heartbeat-file check reported
  # this service healthy even while every dump attempt was failing
  # (see docker/backup/Dockerfile's comment), since a heartbeat only
  # proves the loop is alive, not that it's succeeding at its one job.
  dump_once || log "dump_once failed this cycle, will retry next interval"
  prune_old || log "prune_old failed this cycle"
  sleep "${INTERVAL_SECONDS}"
done
