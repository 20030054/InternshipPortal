import { describe, expect, it } from "vitest";
import { requiresCsrfCheck, isOriginAllowed } from "@/server/security/csrf";

describe("requiresCsrfCheck (§9 CSRF)", () => {
  it("requires a check for a mutating request to a normal API route", () => {
    expect(requiresCsrfCheck("/api/cases/123/offer", "POST")).toBe(true);
    expect(requiresCsrfCheck("/api/waivers/123/approve", "PATCH")).toBe(true);
    expect(requiresCsrfCheck("/api/grades/123/reverse", "DELETE")).toBe(true);
  });

  it("does not require a check for a safe (read) method", () => {
    expect(requiresCsrfCheck("/api/cases/123", "GET")).toBe(false);
    expect(requiresCsrfCheck("/api/cases/123", "HEAD")).toBe(false);
    expect(requiresCsrfCheck("/api/cases/123", "OPTIONS")).toBe(false);
  });

  it("does not require a check for a non-API route (a page)", () => {
    expect(requiresCsrfCheck("/hod", "POST")).toBe(false);
  });

  it("excludes /api/auth/** -- Auth.js has its own CSRF handling", () => {
    expect(requiresCsrfCheck("/api/auth/password-reset/request", "POST")).toBe(false);
  });

  it("excludes /api/supervisor/** -- token-in-URL authenticated, not cookie-authenticated", () => {
    expect(requiresCsrfCheck("/api/supervisor/evaluate/some-token", "POST")).toBe(false);
  });

  it("is case-sensitive to method but accepts lowercase (normalizes)", () => {
    expect(requiresCsrfCheck("/api/cases/123/offer", "post")).toBe(true);
  });
});

describe("isOriginAllowed (§9 CSRF)", () => {
  const appOrigin = "https://internship.scit.bnu.edu.pk";

  it("allows a matching Origin header", () => {
    expect(isOriginAllowed(appOrigin, null, appOrigin)).toBe(true);
  });

  it("rejects a mismatched Origin header", () => {
    expect(isOriginAllowed("https://evil.test", null, appOrigin)).toBe(false);
  });

  it("falls back to Referer when Origin is absent, allowing a matching one", () => {
    expect(isOriginAllowed(null, `${appOrigin}/hod`, appOrigin)).toBe(true);
  });

  it("falls back to Referer when Origin is absent, rejecting a mismatched one", () => {
    expect(isOriginAllowed(null, "https://evil.test/x", appOrigin)).toBe(false);
  });

  it("rejects when neither Origin nor Referer is present (fails closed)", () => {
    expect(isOriginAllowed(null, null, appOrigin)).toBe(false);
  });

  it("rejects a malformed Referer rather than throwing", () => {
    expect(isOriginAllowed(null, "not a url", appOrigin)).toBe(false);
  });

  it("Origin takes precedence over a mismatched Referer", () => {
    expect(isOriginAllowed(appOrigin, "https://evil.test/x", appOrigin)).toBe(true);
  });
});
