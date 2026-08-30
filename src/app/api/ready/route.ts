import { NextResponse } from "next/server";
import { checkDatabase, checkRedis } from "@/server/health/checks";

// Readiness: checks the dependencies the app actually needs to serve a real
// request. Returns 503 with which dependency failed rather than a bare
// failure, so compose healthchecks and human operators can tell database
// trouble from Redis trouble at a glance.
export async function GET() {
  const [database, redis] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const ready = database.ok && redis.ok;

  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", database, redis },
    { status: ready ? 200 : 503 },
  );
}
