#!/bin/sh
# Placeholder backup loop for M00. Logs a heartbeat and touches
# /tmp/healthy on an interval so the compose healthcheck has something real
# to watch, and so the `backup` service is exercised end-to-end before
# there's a database schema worth dumping.
#
# TODO(M01): once prisma/schema.prisma exists, replace the `echo` below
# with a real `pg_dump "$DATABASE_URL" -F c -f "/backups/$(date +%Y%m%d_%H%M%S).dump"`
# and add BACKUP_RETENTION_DAYS-based pruning of /backups, per
# MASTER_PROMPT.md §8.2 and §8.1 (the `scit_backups` volume).
set -eu

INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-3600}"

echo "[backup] placeholder sidecar started; real pg_dump logic lands in M01"

while true; do
  echo "[backup] heartbeat $(date -u +%Y-%m-%dT%H:%M:%SZ) — nothing to dump yet (TODO M01)"
  touch /tmp/healthy
  sleep "$INTERVAL_SECONDS"
done
