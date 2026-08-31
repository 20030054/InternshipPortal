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
  CASE_NOTIFICATIONS_QUEUE_NAME,
  SLA_ESCALATION_QUEUE_NAME,
  SUPERVISOR_REMINDER_QUEUE_NAME,
  HOD_DIGEST_QUEUE_NAME,
  SLA_SWEEP_INTERVAL_MS,
  getSlaEscalationQueue,
  getSupervisorReminderQueue,
  getHodDigestQueue,
} from "../src/server/jobs/queue";
import { runAutoEnrollmentSweep } from "../src/server/roster/auto-enrollment-sweep";
import { dispatchTransitionNotification } from "../src/server/notifications/service";
import {
  runFocalSlaSweep,
  runSupervisorReminderSweep,
  runHodDigest,
} from "../src/server/sla/service";

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

const rosterWorker = new Worker(
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
rosterWorker.on("failed", (job, err) => {
  log("roster sweep job failed", { jobId: job?.id, error: err.message });
});

// M12: event-driven — one job per transition, enqueued at the end of
// executeTransition() (M04). Default attempts: 1 (no BullMQ retry) is
// exactly the intended behaviour here — see docs/modules/M12.md "Scope
// decisions."
const caseNotificationsWorker = new Worker(
  CASE_NOTIFICATIONS_QUEUE_NAME,
  async (job: Job<{ caseEventId: string; emitsEvent: string }>) => {
    await dispatchTransitionNotification(job.data.caseEventId, job.data.emitsEvent);
    heartbeat();
  },
  { connection },
);
caseNotificationsWorker.on("failed", (job, err) => {
  log("case notification job failed", { jobId: job?.id, error: err.message });
});

const slaEscalationWorker = new Worker(
  SLA_ESCALATION_QUEUE_NAME,
  async (job: Job) => {
    log("focal SLA sweep job started", { jobId: job.id });
    const result = await runFocalSlaSweep();
    log("focal SLA sweep job finished", { jobId: job.id, escalated: result.escalated });
    heartbeat();
    return result;
  },
  { connection },
);
slaEscalationWorker.on("failed", (job, err) => {
  log("focal SLA sweep job failed", { jobId: job?.id, error: err.message });
});

const supervisorReminderWorker = new Worker(
  SUPERVISOR_REMINDER_QUEUE_NAME,
  async (job: Job) => {
    log("supervisor reminder sweep job started", { jobId: job.id });
    const result = await runSupervisorReminderSweep();
    log("supervisor reminder sweep job finished", { jobId: job.id, ...result });
    heartbeat();
    return result;
  },
  { connection },
);
supervisorReminderWorker.on("failed", (job, err) => {
  log("supervisor reminder sweep job failed", { jobId: job?.id, error: err.message });
});

const hodDigestWorker = new Worker(
  HOD_DIGEST_QUEUE_NAME,
  async (job: Job) => {
    log("HoD digest job started", { jobId: job.id });
    const result = await runHodDigest();
    log("HoD digest job finished", { jobId: job.id, ...result });
    heartbeat();
    return result;
  },
  { connection },
);
hodDigestWorker.on("failed", (job, err) => {
  log("HoD digest job failed", { jobId: job?.id, error: err.message });
});

/**
 * Registers every repeatable schedule at worker startup. BullMQ dedupes
 * repeatable jobs by their repeat configuration + jobId, so restarting
 * the worker (or briefly running two during a rolling deploy) doesn't
 * produce duplicate schedules.
 */
async function registerSchedules(): Promise<void> {
  // BullMQ 6.x moved repeatable jobs off Queue.add's `repeat` option (it's
  // no longer a valid JobsOptions field) onto upsertJobScheduler, which is
  // itself idempotent by schedulerId — restarting the worker re-calls this
  // safely rather than accumulating duplicate schedules.
  await getRosterSweepQueue().upsertJobScheduler(
    "roster-sweep-schedule",
    { every: ROSTER_SWEEP_INTERVAL_MS },
    { name: "sweep" },
  );
  log("roster sweep schedule registered", { intervalMs: ROSTER_SWEEP_INTERVAL_MS });

  await getSlaEscalationQueue().upsertJobScheduler(
    "sla-escalation-schedule",
    { every: SLA_SWEEP_INTERVAL_MS },
    { name: "sweep" },
  );
  log("focal SLA escalation schedule registered", { intervalMs: SLA_SWEEP_INTERVAL_MS });

  await getSupervisorReminderQueue().upsertJobScheduler(
    "supervisor-reminder-schedule",
    { every: SLA_SWEEP_INTERVAL_MS },
    { name: "sweep" },
  );
  log("supervisor reminder schedule registered", { intervalMs: SLA_SWEEP_INTERVAL_MS });

  await getHodDigestQueue().upsertJobScheduler(
    "hod-digest-schedule",
    { every: SLA_SWEEP_INTERVAL_MS },
    { name: "digest" },
  );
  log("HoD digest schedule registered", { intervalMs: SLA_SWEEP_INTERVAL_MS });
}

heartbeat();
const heartbeatInterval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

registerSchedules().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "failed to register one or more schedules",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
});

log("worker ready", {
  note: "consuming roster-sweep, case-notifications, sla-escalation-sweep, supervisor-reminder-sweep, hod-digest queues",
});

process.on("SIGTERM", () => {
  log("worker shutting down (SIGTERM)");
  clearInterval(heartbeatInterval);
  void Promise.all([
    rosterWorker.close(),
    caseNotificationsWorker.close(),
    slaEscalationWorker.close(),
    supervisorReminderWorker.close(),
    hodDigestWorker.close(),
  ]).finally(() => process.exit(0));
});
