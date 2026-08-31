#!/bin/sh
# Brings up the full docker compose stack locally with real demo data
# and working passwords, for trying out the portal as each role. Not a
# production deployment procedure — see docs/RUNBOOK.md for that. This
# script exists because that real procedure has several steps whose
# exact commands are easy to get wrong (see docs/DECISIONS.md D-098
# through D-100 and this session's own verification): the runtime
# app/worker image has neither `prisma/` nor a package manager, so
# migrations run via a separately-built `builder`-stage image; role
# provisioning goes through postgres's own bundled `psql`, not a
# script that assumes a tool no image here actually ships.
#
# Usage: sh scripts/dev/local-demo.sh
# Requires: docker, docker compose, a filled-in .env (copy .env.example
# and fill in every value — see its own comments).
set -eu

if [ ! -f .env ]; then
  echo "No .env found. Copy .env.example to .env and fill in every value first." >&2
  exit 1
fi

echo "==> Bringing up the full stack (building images if needed)..."
docker compose up --build -d

echo "==> Building the migrator image (has prisma/ + pnpm; the runtime app/worker image doesn't)..."
docker build --target builder -t scit-migrator-local .

# Asks the running `postgres` container itself which network it's on,
# rather than guessing from a name pattern — a machine with other,
# unrelated compose projects also running (each also getting a
# `*_default` network) makes a name-filtered guess genuinely wrong,
# not just theoretically fragile. Found for real running this script.
POSTGRES_CONTAINER="$(docker compose ps -q postgres)"
NETWORK="$(docker inspect "$POSTGRES_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"

echo "==> Applying migrations..."
docker run --rm --network "$NETWORK" --env-file .env scit-migrator-local pnpm exec prisma migrate deploy

echo "==> Provisioning the runtime role's password..."
POSTGRES_USER_VAL="$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)"
POSTGRES_DB_VAL="$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)"
APP_ROLE_PW="$(grep '^DATABASE_APP_ROLE_PASSWORD=' .env | cut -d= -f2-)"
docker compose exec -T postgres psql -U "$POSTGRES_USER_VAL" -d "$POSTGRES_DB_VAL" \
  -c "ALTER ROLE scit_app WITH LOGIN PASSWORD '${APP_ROLE_PW}';"

# NODE_ENV=development is what makes prisma/seed.ts actually set a
# password on the demo accounts — see setDevPasswordIfMissing()'s own
# comment. It deliberately never does this when NODE_ENV=production
# (as your real .env should say for anything beyond this local demo),
# so this override is scoped to just this one seed run, not your
# actual deployment config.
echo "==> Seeding demo data (dev passwords included, this run only)..."
docker run --rm --network "$NETWORK" --env-file .env -e NODE_ENV=development \
  scit-migrator-local pnpm exec tsx prisma/seed.ts

echo "==> Restarting app/worker so they see the now-provisioned role..."
docker compose restart app worker

echo ""
echo "Ready. Open http://localhost (or your configured APP_URL) and log in as:"
echo ""
echo "  Admin          admin@example.scit.test   dev-password-not-for-prod"
echo "  Focal Person   focal@example.scit.test   dev-password-not-for-prod"
echo "  HoD            hod@example.scit.test     dev-password-not-for-prod"
echo "  Dean           dean@example.scit.test    dev-password-not-for-prod"
echo "  Student        student1@example.scit.test .. student5@example.scit.test   dev-password-not-for-prod"
echo ""
echo "Note: the five seeded demo students aren't eligible to open a case yet"
echo "(seed.ts's own comment: not enough closed-semester history is manufactured"
echo "on purpose, to avoid faking eligibility data). To see the full eight-step"
echo "flow end to end, either wait until real roster data makes a student"
echo "eligible, or ask for a one-off eligible test student to be created."
