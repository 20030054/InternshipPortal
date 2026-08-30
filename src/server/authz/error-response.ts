import { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "./require-capability";

/**
 * Shared `catch` handling for route handlers: returns the right JSON
 * response for the two authz error types, or `null` if the caught error
 * is something else (in which case the caller should re-throw it, not
 * swallow it).
 */
export function authzErrorResponse(err: unknown): Response | null {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
