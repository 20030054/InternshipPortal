import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts because this suite needs a real Postgres
// with migrations applied and the scit_app runtime role already
// provisioned (DATABASE_MIGRATION_ROLE + DATABASE_URL pointing at it) — it
// is not part of the fast, dependency-free default `pnpm test` run. See
// docs/modules/M01.md and .github/workflows/ci.yml's `db-tests` job.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Real network round-trips to Postgres are slower than the mocked
    // unit suite and can be slow to spin up on a cold CI runner.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Constraint/privilege tests share one database and must not run
    // concurrently against it — fixture IDs are stable, not randomised
    // per test, so parallel files would collide.
    fileParallelism: false,
  },
});
