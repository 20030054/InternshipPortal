import Redis from "ioredis";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set — rate limiting needs Redis.");
    }
    redis = new Redis(url);
  }
  return redis;
}

export type RateLimitResult = { allowed: boolean; remaining: number };

/**
 * A fixed-window counter (INCR + EXPIRE), not a sliding window — a burst
 * right at a window boundary can exceed the nominal rate by up to 2x.
 * That's an acceptable trade for the coarse abuse-slowing this exists
 * for (MASTER_PROMPT.md §9: "Rate limits on login, password reset,
 * supervisor token submission and file upload"); a precise algorithm
 * would be more code for a guarantee this system doesn't need.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = getRedis();
  const fullKey = `ratelimit:${key}`;
  const count = await client.incr(fullKey);
  if (count === 1) {
    await client.expire(fullKey, windowSeconds);
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/**
 * §9: "Rate limits on... file upload." M14's own gap — the three
 * upload-accepting routes (offer letter, completion certificate,
 * waiver evidence) had none. Keyed by the authenticated user, not IP —
 * unlike login/password-reset (pre-authentication, IP is the only
 * identity available), these routes already require a session.
 */
export async function checkUploadRateLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit(`upload:${userId}`, 10, 60 * 60);
}
