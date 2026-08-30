import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "@/server/companies/normalize";

describe("normalizeCompanyName", () => {
  it("lowercases and trims", () => {
    expect(normalizeCompanyName("  Acme Corp  ")).toBe("acme corp");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeCompanyName("Acme   Corp")).toBe("acme corp");
  });

  it("treats case and whitespace variants as equal", () => {
    expect(normalizeCompanyName("ACME CORP")).toBe(normalizeCompanyName("acme  corp"));
  });

  it("does not fold visually distinct names together", () => {
    expect(normalizeCompanyName("Acme Corp")).not.toBe(normalizeCompanyName("Acme Corp Inc"));
  });
});
