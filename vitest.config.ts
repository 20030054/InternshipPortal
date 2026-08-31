import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  // tsconfig.json's `jsx: "preserve"` is correct for Next's own SWC-based
  // build (M13: docs/modules/M13.md) but leaves Vite's transform with
  // nothing to turn JSX into — without an override, JSX is passed
  // straight to a plain-JS parser and fails with "invalid JS syntax" the
  // moment any test imports a .tsx file (first hit in M13, when a test
  // first needed to import a React-PDF document component). Overridden
  // here rather than in tsconfig.json, which must stay "preserve" for
  // Next's own build.
  //
  // `oxc: false` matters as much as the `esbuild.jsx` setting itself:
  // this Vite version's default transform pipeline is Oxc (Rolldown's
  // Rust-based transformer, not esbuild), which silently ignores
  // `esbuild.jsx` entirely — Vite logs "Both esbuild and oxc options
  // were set. oxc options will be used" and the same parse failure
  // recurs. Oxc's own `TransformOptions` has no equivalent JSX-runtime
  // knob to redirect instead, so falling all the way back to the
  // esbuild pipeline is the fix, not a workaround for one missing.
  oxc: false,
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // Only the mocked, no-external-dependency unit suite runs on a plain
    // `pnpm test` / in the default CI job. Integration tests
    // (tests/integration/**) need a real Postgres with migrations and the
    // scit_app role already provisioned — see vitest.integration.config.ts
    // and `pnpm test:integration`.
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
