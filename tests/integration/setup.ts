import { vi } from "vitest";

/**
 * Route-handler integration tests call the real GET/POST exports of a
 * route module directly (see tests/unit/health.test.ts's pattern from
 * M00) against a *real* Postgres — but they need a way to stand in for
 * "there is a signed-in browser with a valid session cookie" without
 * running a full HTTP server through a real Auth.js sign-in flow.
 *
 * This mocks only `@/server/auth/config`'s `auth` export (the one
 * function that reads the session cookie) — everything downstream of it
 * (loadIdentity's DB read, requireCapability's decision, the route's own
 * Prisma queries) is real. That's the right boundary: it proves the
 * authorization logic and the database constraints actually work
 * together, while not needing to reimplement cookie parsing/JWT
 * decryption in a test, or construct a real NextAuth instance (which
 * `config.ts`'s top-level `NextAuth({...})` call would otherwise do on
 * import).
 */
export const sessionState: {
  current: { user: { id: string; tokenVersion?: number } } | null;
} = { current: null };

vi.mock("@/server/auth/config", () => ({
  auth: vi.fn(async () => sessionState.current),
}));
