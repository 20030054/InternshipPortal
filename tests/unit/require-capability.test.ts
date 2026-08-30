import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  requireCapability,
  UnauthenticatedError,
} from "@/server/authz/require-capability";

describe("requireCapability", () => {
  it("throws UnauthenticatedError for a null identity", () => {
    expect(() => requireCapability(null, "self.view")).toThrow(
      UnauthenticatedError,
    );
  });

  it("throws ForbiddenError when the identity's roles don't grant the capability", () => {
    expect(() =>
      requireCapability({ userId: "u1", roles: ["STUDENT"] }, "grade.award"),
    ).toThrow(ForbiddenError);
  });

  it("returns the identity when a held role grants the capability", () => {
    const identity = { userId: "u1", roles: ["FOCAL"] as const };
    expect(requireCapability(identity, "offer.approve")).toBe(identity);
  });

  it("grants access if any one of several held roles qualifies", () => {
    const identity = { userId: "u1", roles: ["STUDENT", "ADMIN"] as const };
    expect(() => requireCapability(identity, "users.manage")).not.toThrow();
  });

  it("never reads a role from anything but the identity argument — there is no request parameter to read one from", () => {
    // This is a structural guarantee, not a behavioral one: the function
    // signature is (identity, capability), full stop. This test exists so
    // a future edit that adds a third "request"/"body" parameter (and
    // starts trusting a client-supplied role) fails obviously in code
    // review, not just in intent.
    expect(requireCapability.length).toBe(2);
  });

  it("is a pure function: two calls with equal-shaped identities behave identically", () => {
    const a = { userId: "u1", roles: ["HOD"] as const };
    const b = { userId: "u2", roles: ["HOD"] as const };
    expect(() => requireCapability(a, "grade.award")).not.toThrow();
    expect(() => requireCapability(b, "grade.award")).not.toThrow();
  });
});
