// The `worker` compose service's real entrypoint, replacing M00's
// heartbeat-only placeholder. Run via `node node_modules/tsx/dist/cli.mjs
// worker/index.ts` (see docker-compose.yml) — tsx runs this TypeScript
// file directly in production, no separate build step, sharing the exact
// same Prisma client and business-logic modules the API routes use. See
// docs/modules/M03.md "Why the Dockerfile changed" for the full
// reasoning behind running the worker this way instead of M00's plain-JS
// approach.
import { writeFileSync } from "node:fs";
import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import {
  ROSTER_SWEEP_INTERVAL_MS,
  ROSTER_SWEEP_QUEUE_NAME,
  getRosterSweepQueue,
} from "../src/server/jobs/queue";
import { runAutoEnrollmentSweep } from "../src/server/roster/auto-enrollment-sweep";

const HEARTBEAT_PATH = "/tmp/healthy";
const HEARTBEAT_INTERVAL_MS = 15_000;

function log(msg: string, extra: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({ level: "info", msg, time: new Date().toISOString(), ...extra }),
  );
}

function heartbeat(): void {
  writeFileSync(HEARTBEAT_PATH, new Date().toISOString());
}

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return url;
}

const connection = new Redis(requireRedisUrl(), { maxRetriesPerRequest: null });

const worker = new Worker(
  ROSTER_SWEEP_QUEUE_NAME,
  async (job: Job) => {
    log("roster sweep job started", { jobId: job.id });
    const result = await runAutoEnrollmentSweep();
    log("roster sweep job finished", {
      jobId: job.id,
      studentsEnrolled: result.studentsEnrolled,
    });
    heartbeat();
    return result;
  },
  { connection },
);

worker.on("failed", (job, err) => {
  log("roster sweep job failed", { jobId: job?.id, error: err.message });
});

/**
 * Registers the repeatable schedule at worker startup. BullMQ dedupes
 * repeatable jobs by their repeat configuration + jobId, so restarting
 * the worker (or briefly running two during a rolling deploy) doesn't
 * produce duplicate schedules.
 */
async function registerSchedule(): Promise<void> {
  // BullMQ 6.x moved repeatable jobs off Queue.add's `repeat` option (it's
  // no longer a valid JobsOptions field) onto upsertJobScheduler, which is
  // itself idempotent by schedulerId — restarting the worker re-calls this
  // safely rather than accumulating duplicate schedules.
  const queue = getRosterSweepQueue();
  await queue.upsertJobScheduler(
    "roster-sweep-schedule",
    { every: ROSTER_SWEEP_INTERVAL_MS },
    { name: "sweep" },
  );
  log("roster sweep schedule registered", {
    intervalMs: ROSTER_SWEEP_INTERVAL_MS,
  });
}

heartbeat();
const heartbeatInterval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

registerSchedule().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "failed to register roster sweep schedule",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
});

log("worker ready", { note: "consuming roster-sweep queue" });

process.on("SIGTERM", () => {
  log("worker shutting down (SIGTERM)");
  clearInterval(heartbeatInterval);
  void worker.close().finally(() => process.exit(0));
});
