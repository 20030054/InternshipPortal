import { Queue } from "bullmq";
import Redis from "ioredis";

/**
 * BullMQ's Queue/Worker classes require `maxRetriesPerRequest: null` on
 * their ioredis connection — a documented BullMQ requirement, not an
 * arbitrary choice, so its blocking commands (used internally for job
 * polling) don't get interrupted by ioredis's own retry logic.
 */
function createConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set — BullMQ needs a Redis connection.");
  }
  return new Redis(url, { maxRetriesPerRequest: null });
}

export const ROSTER_SWEEP_QUEUE_NAME = "roster-sweep";

/** Not specified by the master prompt; a defensible default for a job
 * whose whole purpose is catching stragglers well before a semester
 * boundary matters in practice — logged in DECISIONS.md. */
export const ROSTER_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

let queue: Queue | null = null;

/** The app uses this to inspect/trigger the queue (the on-demand
 * sweep-now route); the worker uses it to register the repeatable
 * schedule at startup. Both share the same queue name/connection shape
 * so they agree on what job they're talking about. */
export function getRosterSweepQueue(): Queue {
  if (!queue) {
    queue = new Queue(ROSTER_SWEEP_QUEUE_NAME, {
      connection: createConnection(),
    });
  }
  return queue;
}
