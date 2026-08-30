// Placeholder BullMQ consumer entrypoint. The `worker` compose service runs
// this image with `node worker/index.mjs` as its command instead of
// `node server.js` (the `app` service's command) — same image, different
// process, per MASTER_PROMPT.md §6.1 and §8.1.
//
// This does not process jobs yet. M12 (Notifications and SLA escalation)
// replaces this file with a real BullMQ Worker that consumes the queues
// defined there. Until then its only job is to start cleanly, log that it's
// alive, stay running, and maintain a heartbeat file so the compose
// healthcheck (see docker-compose.yml, which can't reuse the app image's
// HTTP healthcheck since this process serves no HTTP) has something real to
// watch.
//
// Deliberately plain JS (not TypeScript) so it runs directly under Node in
// the runtime image with no build step or ts-node/tsx dependency.

import { writeFileSync } from "node:fs";

const HEARTBEAT_PATH = "/tmp/healthy";
const HEARTBEAT_INTERVAL_MS = 15_000;

function log(msg, extra = {}) {
  console.log(
    JSON.stringify({ level: "info", msg, time: new Date().toISOString(), ...extra }),
  );
}

function heartbeat() {
  writeFileSync(HEARTBEAT_PATH, new Date().toISOString());
}

log("worker ready", { note: "placeholder — no jobs are processed until M12" });
heartbeat();

const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

process.on("SIGTERM", () => {
  log("worker shutting down (SIGTERM)");
  clearInterval(interval);
  process.exit(0);
});
