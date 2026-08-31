# syntax=docker/dockerfile:1
#
# The `backup` compose service. M14 replaced backup.sh's placeholder
# body with a real `pg_dump` loop (see docs/modules/M14.md — the
# M00-era TODO comment here said "M01 replaces backup.sh's body," but
# no module through M13 actually did) and added restore.sh, run
# on-demand by an operator (`docker compose exec backup restore.sh ...`
# — see docs/RUNBOOK.md), never automatically. The container shape
# (image, healthcheck mechanism, restart policy) established at M00
# does not change.
FROM postgres:16-alpine

COPY backup.sh /usr/local/bin/backup.sh
COPY restore.sh /usr/local/bin/restore.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

# M14: a real, previously-undiscovered bug, caught only by actually
# running `docker compose up` and inspecting whether a dump ever
# appeared — /backups (docker-compose.yml's scit_backups volume mount
# point) was never created in the image, so Docker initialized the
# fresh named volume owned by root, and every single pg_dump attempt
# failed with "Permission denied" from the moment this container first
# started, on every one of its scheduled runs, silently: the compose
# healthcheck only checked that the loop process was still alive
# (see backup.sh's own comment on /tmp/healthy), not that a dump had
# actually been produced, so `docker compose ps` reported this service
# healthy the entire time. Creating the directory (and setting its
# ownership) here, before USER postgres, means Docker's own volume
# copy-up behavior (an empty named volume inherits the image
# directory's content and ownership on first mount, not root) gives
# the postgres user write access from the very first start.
RUN mkdir -p /backups && chown postgres:postgres /backups

# postgres:16-alpine already runs as a non-root-capable base, but the image
# itself defaults to root for the postgres server's own needs. This sidecar
# never runs postgres — only pg_dump/pg_isready as a client — so it drops to
# the image's existing unprivileged `postgres` user.
USER postgres

ENTRYPOINT ["/usr/local/bin/backup.sh"]
