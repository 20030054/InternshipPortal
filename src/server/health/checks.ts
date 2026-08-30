import { Client } from "pg";
import Redis from "ioredis";

export type CheckResult = { ok: true } | { ok: false; error: string };

const CONNECT_TIMEOUT_MS = 2000;

/**
 * Trivial connectivity check — connects, runs `SELECT 1`, disconnects.
 * Does not assume the schema exists yet: M00 runs before M01's migrations,
 * so this proves reachability, not correctness. Kept as a short-lived
 * `pg.Client` rather than a pool because this route is called rarely (a
 * readiness probe) and shouldn't hold a persistent connection.
 */
export async function checkDatabase(): Promise<CheckResult> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return { ok: false, error: "DATABASE_URL is not set" };
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  } finally {
    await client.end().catch(() => {
      // Nothing further to do if the connection was never established.
    });
  }
}

/** Trivial connectivity check — connects and pings. */
export async function checkRedis(): Promise<CheckResult> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return { ok: false, error: "REDIS_URL is not set" };
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // never retry — this is a probe, not a job
  });

  try {
    await redis.connect();
    await redis.ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  } finally {
    redis.disconnect();
  }
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}
