import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // M00 used `output: "standalone"` for a pruned runtime node_modules.
  // M03 removed it: the worker process needs bullmq/tsx too, and Next's
  // file tracer only follows imports reachable from the Next.js app
  // itself — it has no way to know a separate process needs them. Rather
  // than duplicate business logic in an untyped worker script or add a
  // second build pipeline, the Dockerfile now copies the full builder
  // node_modules into runtime and both `app` and `worker` run from it.
  // See docs/modules/M03.md "Why the Dockerfile changed" and
  // DECISIONS.md.

  eslint: {
    // Never let a build silently pass with lint errors.
    ignoreDuringBuilds: false,
  },

  // No third-party CDN for authenticated assets and no client-side-only
  // authorisation, per MASTER_PROMPT.md §6.3 — images stay same-origin.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
