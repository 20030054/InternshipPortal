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

/**
 * The temp Postgres/Redis containers this test loop already spins up
 * have no ClamAV alongside them — its virus database load takes minutes
 * on first boot, impractical here — so `scanBuffer()` is mocked to
 * report clean by default (same boundary M02 drew around `sendMail()`).
 * The real error classes are kept (via `importOriginal`) so a test can
 * still exercise the infected/unavailable paths with
 * `vi.mocked(scanBuffer).mockRejectedValueOnce(new InfectedFileError(...))`
 * and route handlers' `instanceof` checks still match. The real clamd
 * protocol client is proven for real only against the compose stack —
 * see docs/modules/M06.md "Scope decisions."
 */
vi.mock("@/server/documents/clamav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/documents/clamav")>();
  return {
    ...actual,
    scanBuffer: vi.fn(async () => undefined),
  };
});
