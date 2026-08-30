import { Client } from "pg";

/**
 * A fresh connection as the schema-owning migration role. Used in tests
 * only where a fixture genuinely needs privileges the runtime role
 * shouldn't have — most fixture setup goes through appClient() instead,
 * since proving the *restricted* role's own behavior end to end is the
 * point of this suite.
 */
export function migrationClient(): Client {
  const url = process.env.DATABASE_MIGRATION_ROLE;
  if (!url) {
    throw new Error(
      "DATABASE_MIGRATION_ROLE is not set — integration tests need a real " +
        "Postgres with migrations applied. See docs/modules/M01.md.",
    );
  }
  return new Client({ connectionString: url });
}

/**
 * A fresh connection as the runtime role ("scit_app") — what `app` and
 * `worker` actually connect as in production. DATABASE_URL must already
 * point at it with its password provisioned (see
 * scripts/db/provision-runtime-role.sh).
 */
export function appClient(): Client {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set (should point at the scit_app runtime role)",
    );
  }
  return new Client({ connectionString: url });
}
