import { NextResponse } from "next/server";

// Liveness only: proves the process is up and serving requests. No
// dependency checks — that's /api/ready. Never gate this on the database or
// Redis, or a container orchestrator will restart a healthy process just
// because a dependency is briefly unreachable.
export function GET() {
  return NextResponse.json({ status: "ok" });
}
