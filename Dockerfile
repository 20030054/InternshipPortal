# syntax=docker/dockerfile:1

# Multi-stage build: deps -> builder -> runtime. Same final image is used
# for both the `app` and `worker` compose services; only the command
# differs (see docker-compose.yml).
#
# M01 confirmed it: Prisma's query engine needs libssl on top of
# node:22-slim's Debian base, or it falls back to guessing the OpenSSL
# version ("Prisma failed to detect the libssl/openssl version to use")
# instead of resolving it properly. Installed in every stage that touches
# @prisma/client — deps (the `prisma generate` postinstall hook), builder
# (`next build` loads the generated client), and runtime (the app actually
# runs queries).
#
# M03 note: runtime copies the FULL node_modules from the builder stage
# (not Next's pruned `standalone` output) — the `worker` service runs real
# TypeScript via `tsx` and needs `bullmq` alongside it, neither of which
# Next's file tracer would know to include for a process it doesn't
# control. See docs/modules/M03.md "Why the Dockerfile changed" and
# DECISIONS.md for the full reasoning and the trade-off this accepts
# (a larger image, carrying devDependencies it doesn't execute).

ARG NODE_VERSION=22-slim

# ---- deps: install with dev dependencies, cached separately from source ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder: compile the Next.js app ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The deps stage installs from only package.json + the lockfile (so its
# layer cache is keyed on dependency changes, not schema changes) — which
# means @prisma/client's postinstall hook ran with no prisma/schema.prisma
# to see yet and generated nothing usable. Generate explicitly here, now
# that the full source (including prisma/) has been copied in, and before
# `next build` needs the generated client's types. `prisma generate` never
# connects to a database, but it does check that the datasource's env var
# is defined — a placeholder satisfies that; the real value is supplied at
# container runtime via docker-compose's env_file and overrides this.
ENV DATABASE_MIGRATION_ROLE="postgresql://build:build@localhost:5432/build"
RUN pnpm exec prisma generate
RUN pnpm build

# ---- runtime: non-root, full node_modules (see file header) ----
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user that owns /data/uploads inside the container, per
# MASTER_PROMPT.md §8.1. Nothing writes to /data/uploads until M06, but the
# ownership is established here so no later module has to remember to.
RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --shell /usr/sbin/nologin --create-home appuser \
    && mkdir -p /data/uploads \
    && chown -R appuser:appuser /data/uploads /app

# Full node_modules from builder — already has the real generated Prisma
# Client (builder ran `prisma generate` against the actual schema), plus
# everything the worker needs (bullmq, tsx) that Next's tracer would never
# have found on its own.
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/.next ./.next
COPY --from=builder --chown=appuser:appuser /app/public ./public
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/worker ./worker
# The app runs from the compiled .next output above and never needed raw
# src/ at runtime before now — the worker does: tsx compiles
# worker/index.ts (and everything it imports under src/server/**) on the
# fly, so the actual TypeScript source has to exist on disk here, not
# just in the builder stage. tsconfig.json is needed too, for tsx to
# resolve the "@/*" path alias those files use.
COPY --from=builder --chown=appuser:appuser /app/src ./src
COPY --from=builder --chown=appuser:appuser /app/tsconfig.json ./tsconfig.json

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Default command runs the Next.js server (the `app` service) directly via
# its compiled entry point — no `next` CLI/package-manager wrapper needed
# at runtime. The `worker` compose service overrides this with
# `node node_modules/tsx/dist/cli.mjs worker/index.ts`.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
