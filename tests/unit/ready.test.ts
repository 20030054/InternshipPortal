import { afterEach, describe, expect, it, vi } from "vitest";

// pg and ioredis are mocked rather than pointed at a real closed port: a
// closed-port connection attempt's failure mode (ECONNREFUSED vs. a hang)
// varies by platform and firewall, which would make this suite flaky in
// CI. Mocking the two clients lets both the success and failure paths be
// asserted deterministically, which is what actually matters here — that
// /api/ready reports the right status and names the right dependency.
const connectMock = vi.fn();
const queryMock = vi.fn();
const endMock = vi.fn();

vi.mock("pg", () => ({
  // Arrow functions cannot be used as constructors, so `new Client()` needs
  // a plain function expression here even though it reads a little dated
  // next to the rest of the codebase.
  Client: vi.fn().mockImplementation(function MockClient() {
    return { connect: connectMock, query: queryMock, end: endMock };
  }),
}));

const redisConnectMock = vi.fn();
const pingMock = vi.fn();
const disconnectMock = vi.fn();

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(function MockRedis() {
    return {
      connect: redisConnectMock,
      ping: pingMock,
      disconnect: disconnectMock,
    };
  }),
}));

const { GET } = await import("@/app/api/ready/route");

describe("GET /api/ready", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("returns 200 when database and redis are both reachable", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.REDIS_URL = "redis://localhost:6379";
    connectMock.mockResolvedValue(undefined);
    queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    endMock.mockResolvedValue(undefined);
    redisConnectMock.mockResolvedValue(undefined);
    pingMock.mockResolvedValue("PONG");

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ready",
      database: { ok: true },
      redis: { ok: true },
    });
  });

  it("returns 503 identifying the database when it is unreachable", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:1/db";
    process.env.REDIS_URL = "redis://localhost:6379";
    connectMock.mockRejectedValue(new Error("connection refused"));
    endMock.mockResolvedValue(undefined);
    redisConnectMock.mockResolvedValue(undefined);
    pingMock.mockResolvedValue("PONG");

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("not_ready");
    expect(body.database).toEqual({ ok: false, error: "connection refused" });
    expect(body.redis).toEqual({ ok: true });
  });

  it("returns 503 identifying redis when it is unreachable", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    process.env.REDIS_URL = "redis://localhost:1";
    connectMock.mockResolvedValue(undefined);
    queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    endMock.mockResolvedValue(undefined);
    redisConnectMock.mockRejectedValue(new Error("connection refused"));

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("not_ready");
    expect(body.database).toEqual({ ok: true });
    expect(body.redis).toEqual({ ok: false, error: "connection refused" });
  });

  it("returns 503 without attempting a connection when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    process.env.REDIS_URL = "redis://localhost:6379";
    redisConnectMock.mockResolvedValue(undefined);
    pingMock.mockResolvedValue("PONG");

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.database).toEqual({
      ok: false,
      error: "DATABASE_URL is not set",
    });
    expect(connectMock).not.toHaveBeenCalled();
  });
});
