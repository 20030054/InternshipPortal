/**
 * §9: "CSRF" — a named, explicit acceptance criterion. Auth.js's own
 * sign-in/sign-out flow already has built-in CSRF protection (a
 * double-submit cookie it manages itself); this covers the ~50 other
 * mutating routes, all cookie-session-authenticated, none of which had
 * an explicit check beyond `SameSite=Lax`'s own partial mitigation.
 *
 * Origin-header validation, not a per-form synchronizer token — see
 * docs/modules/M14.md "Scope decisions" for why: a same-origin,
 * cookie-session API with no cross-origin fetch surface by design
 * (§6.3) doesn't need token plumbing through every mutating route to
 * get the standard modern defense for this exact shape of application.
 *
 * Pure functions, no Next.js/Request coupling — `src/middleware.ts` is
 * the only caller, and this shape is what makes the *decision* logic
 * unit-testable at all: Next.js middleware runs in the framework's own
 * routing layer, never exercised by this codebase's established
 * pattern of calling a route handler directly in a test.
 */

/** Same exclusion list as `eslint-rules/require-capability-on-mutation.mjs`
 * — pre-authentication public routes with their own reasoning for not
 * going through the normal session-authenticated mutation path.
 * `/api/auth/**` has Auth.js's own CSRF handling; `/api/supervisor/**`
 * is token-in-URL authenticated, not cookie-authenticated, so CSRF
 * (which specifically exploits *ambient* cookie credentials) doesn't
 * apply to it at all. */
const EXCLUDED_PATH_PREFIXES = ["/api/auth/", "/api/supervisor/"];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requiresCsrfCheck(pathname: string, method: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
  return !EXCLUDED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function originFromUrl(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * `appOrigin` is the deployment's own origin (derived from `APP_URL`).
 * Allowed if `Origin` matches, or — some legitimate same-origin
 * requests omit `Origin` but always carry `Referer` — if `Referer`'s
 * own origin matches. Neither present, or neither matching, fails
 * closed (not allowed): a same-origin browser request for a mutating
 * fetch reliably sends at least one of the two in every browser this
 * portal needs to support.
 */
export function isOriginAllowed(
  originHeader: string | null,
  refererHeader: string | null,
  appOrigin: string,
): boolean {
  if (originHeader) return originHeader === appOrigin;
  if (refererHeader) return originFromUrl(refererHeader) === appOrigin;
  return false;
}
