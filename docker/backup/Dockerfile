# syntax=docker/dockerfile:1
#
# The `backup` compose service. At M00 this only proves the sidecar starts,
# logs a heartbeat and stays supervised — it does not dump anything yet
# because there is no schema to dump until M01. M01 replaces backup.sh's
# body with a real `pg_dump` loop; the container shape (image, healthcheck
# mechanism, restart policy) established here does not change.
FROM postgres:16-alpine

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# postgres:16-alpine already runs as a non-root-capable base, but the image
# itself defaults to root for the postgres server's own needs. This sidecar
# never runs postgres — only pg_dump/pg_isready as a client — so it drops to
# the image's existing unprivileged `postgres` user.
USER postgres

ENTRYPOINT ["/usr/local/bin/backup.sh"]
