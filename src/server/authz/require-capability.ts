import type { RoleName } from "@prisma/client";
import { type Capability, rolesGrantCapability } from "./matrix";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(public readonly capability: Capability) {
    super(`Missing capability: ${capability}`);
    this.name = "ForbiddenError";
  }
}

export type CurrentIdentity = {
  userId: string;
  roles: readonly RoleName[];
} | null;

/**
 * The only function in the codebase permitted to decide "is this request
 * allowed to do X." Takes an already-resolved identity — see
 * src/server/auth/current-identity.ts, the function that actually talks
 * to Auth.js and the database — rather than a raw request, so this stays
 * a pure function: no I/O, trivially unit-testable with plain objects,
 * and structurally incapable of reading a role from a request body,
 * because it has no request body parameter to read one from
 * (MASTER_PROMPT.md §9: "No API route accepts a client-supplied... role
 * ... for authorisation purposes").
 *
 * Every mutating route handler must call this before touching data (see
 * eslint.config.mjs's require-capability-on-mutation rule).
 */
export function requireCapability(
  identity: CurrentIdentity,
  capability: Capability,
): { userId: string; roles: readonly RoleName[] } {
  if (!identity) {
    throw new UnauthenticatedError();
  }
  if (!rolesGrantCapability(identity.roles, capability)) {
    throw new ForbiddenError(capability);
  }
  return identity;
}
