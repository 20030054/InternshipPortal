import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces a minimal runtime folder (server.js + only the
  // node_modules actually needed) that the Dockerfile's runtime stage copies
  // in — this is what keeps the final image slim per M00's Dockerfile spec.
  output: "standalone",

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
