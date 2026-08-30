import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
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
