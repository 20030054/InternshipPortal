import { describe, expect, it } from "vitest";
import { extensionMatches, sniffFileType } from "@/server/documents/magic-bytes";

describe("sniffFileType", () => {
  it("recognises a PDF signature", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(sniffFileType(bytes)).toBe("application/pdf");
  });

  it("recognises a JPEG signature", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffFileType(bytes)).toBe("image/jpeg");
  });

  it("recognises a PNG signature", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffFileType(bytes)).toBe("image/png");
  });

  it("returns null for garbage bytes", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    expect(sniffFileType(bytes)).toBeNull();
  });

  it("returns null for a buffer shorter than any known signature", () => {
    expect(sniffFileType(new Uint8Array([0x25, 0x50]))).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(sniffFileType(new Uint8Array([]))).toBeNull();
  });
});

describe("extensionMatches", () => {
  it("accepts .pdf for application/pdf", () => {
    expect(extensionMatches("offer.pdf", "application/pdf")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(extensionMatches("OFFER.PDF", "application/pdf")).toBe(true);
  });

  it("accepts both .jpg and .jpeg for image/jpeg", () => {
    expect(extensionMatches("photo.jpg", "image/jpeg")).toBe(true);
    expect(extensionMatches("photo.jpeg", "image/jpeg")).toBe(true);
  });

  it("accepts .png for image/png", () => {
    expect(extensionMatches("scan.png", "image/png")).toBe(true);
  });

  it("rejects a mismatched extension", () => {
    expect(extensionMatches("offer.png", "application/pdf")).toBe(false);
    expect(extensionMatches("offer.docx", "application/pdf")).toBe(false);
  });

  it("rejects a filename with no extension at all", () => {
    expect(extensionMatches("offer", "application/pdf")).toBe(false);
  });
});
