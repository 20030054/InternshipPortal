import { NextResponse, type NextRequest } from "next/server";
import { requiresCsrfCheck, isOriginAllowed } from "@/server/security/csrf";

/**
 * §9: CSRF (Origin validation — see src/server/security/csrf.ts) and the
 * full CSP/remaining security headers Caddy's own M00 comment
 * explicitly deferred to this module ("M14 owns the full CSP, HSTS and
 * remaining security headers"). HSTS itself stays in the Caddyfile —
 * it's a TLS-layer concern, and Caddy is the only service terminating
 * TLS (§8.1); everything else lives here since Next.js is what actually
 * renders the pages and needs the nonce wired through its own script
 * tags.
 *
 * Nonce-based `script-src`, no `unsafe-inline` — the standard,
 * documented Next.js CSP pattern. Next applies the same nonce to its
 * own inline RSC-hydration scripts by parsing the `'nonce-...'` token
 * back out of the `Content-Security-Policy` header on the *incoming*
 * request itself (not a custom header — see the comment further down,
 * next to where the request header is set, for how this was actually
 * confirmed rather than assumed). `src/app/layout.tsx` also reads
 * `headers()` once, which — as a side effect — opts every route out of
 * static generation; nonce-based CSP requires this, since a
 * statically-prerendered page's scripts are baked in at build time and
 * can never match a fresh per-request nonce. `style-src` allows
 * `unsafe-inline` — no component in this codebase uses an inline
 * `style` attribute (checked directly), but Next's own font-
 * optimization machinery can still emit one; relaxing only `style-src`,
 * never `script-src` (where injection is the actually dangerous case),
 * is the standard trade-off for a Next.js CSP. See
 * docs/modules/M14.md "Scope decisions."
 */

function appOrigin(): string {
  const raw = process.env.APP_URL ?? "localhost";
  return /^https?:\/\//.test(raw) ? new URL(raw).origin : `https://${raw}`;
}

export function middleware(request: NextRequest) {
  if (requiresCsrfCheck(request.nextUrl.pathname, request.method)) {
    const allowed = isOriginAllowed(
      request.headers.get("origin"),
      request.headers.get("referer"),
      appOrigin(),
    );
    if (!allowed) {
      return NextResponse.json({ error: "csrf_rejected" }, { status: 403 });
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  // Next reads its *own* nonce back by parsing the 'nonce-...' token out
  // of the Content-Security-Policy header on the *incoming* request (see
  // next/dist/server/app-render/get-script-nonce-from-header.js) — not
  // from a custom header — which is what lets it apply the same nonce to
  // its own inline RSC-hydration scripts. Setting it only on the
  // response (what a first draft of this file did) compiles and looks
  // right but silently ships zero nonces on any script tag, which
  // 'strict-dynamic' would then block outright in a real browser. Set on
  // both: the request, for Next's own detection, and the response, for
  // the browser actually enforcing the policy.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own static assets and the favicon —
    // this must run for every page and every API route, since both the
    // CSP header and (for API routes) the CSRF check apply broadly.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
