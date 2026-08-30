import { defineConfig } from "vitest/config";
import AlphabeticalSequencer from "./vitest.integration.sequencer";

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
    // Mocks @/server/auth/config's `auth` export for every file — a
    // no-op for suites that never import it (M01's constraint tests),
    // and what lets M02's route-handler tests stand in a fake session
    // without running a full HTTP server. See tests/integration/setup.ts.
    setupFiles: ["tests/integration/setup.ts"],
    // Real network round-trips to Postgres are slower than the mocked
    // unit suite and can be slow to spin up on a cold CI runner.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Constraint/privilege tests share one database and must not run
    // concurrently against it — fixture IDs are stable, not randomised
    // per test, so parallel files would collide.
    fileParallelism: false,
    // Vitest's default sequencer orders by cached duration, not name —
    // wrong for a shared-database suite whose fixture files rely on a
    // documented "low-numbered blocks run first" ordering. See
    // vitest.integration.sequencer.ts (kept at the project root, not
    // under tests/, since .dockerignore excludes tests/ entirely and
    // this config file is still reachable from Next's own build-time
    // type-check).
    sequence: {
      sequencer: AlphabeticalSequencer,
    },
  },
});
