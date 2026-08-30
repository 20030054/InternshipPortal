# syntax=docker/dockerfile:1

# Multi-stage build: deps -> builder -> runtime. The runtime stage is what
# ships — it never sees devDependencies, the pnpm store, or source files
# that aren't part of the standalone Next.js output. Same final image is
# used for both the `app` and `worker` compose services; only the command
# differs (see docker-compose.yml).
#
# TODO(M01): once Prisma is introduced, confirm whether the query engine
# needs libssl on top of node:22-slim's Debian base — add it to the runtime
# stage's apt-get line below if `prisma migrate deploy` / the generated
# client complains about a missing shared library.

ARG NODE_VERSION=22-slim

# ---- deps: install with dev dependencies, cached separately from source ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder: compile the Next.js app ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- runtime: minimal image, non-root, no build tooling ----
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user that owns /data/uploads inside the container, per
# MASTER_PROMPT.md §8.1. Nothing writes to /data/uploads until M06, but the
# ownership is established here so no later module has to remember to.
RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --shell /usr/sbin/nologin --create-home appuser \
    && mkdir -p /data/uploads \
    && chown -R appuser:appuser /data/uploads /app

# `output: "standalone"` (next.config.ts) produces server.js plus only the
# node_modules actually required at runtime.
COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appuser /app/public ./public

# The worker placeholder script (M12 replaces its contents, not its path).
COPY --from=builder --chown=appuser:appuser /app/worker ./worker

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Default command runs the Next.js server (the `app` service). The `worker`
# compose service overrides this with `node worker/index.mjs`.
CMD ["node", "server.js"]
