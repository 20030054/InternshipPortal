/**
 * MASTER_PROMPT.md §9: "Uploads are validated by extension and magic
 * bytes and MIME." Scoped to exactly the three types `ALLOWED_MIME`
 * ever configures (`.env.example`'s default) — this isn't a general
 * file-type sniffing library, just enough to catch "a byte stream
 * wearing a label that doesn't match its actual content."
 */

export type SupportedMime = "application/pdf" | "image/jpeg" | "image/png";

const SIGNATURES: ReadonlyArray<{ mime: SupportedMime; bytes: number[] }> = [
  // "%PDF-"
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // JFIF/EXIF JPEG start-of-image marker
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // PNG signature
  {
    mime: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];

/** Returns the MIME type the byte content's magic number actually
 * matches, or `null` if it matches none of the supported types. */
export function sniffFileType(bytes: Uint8Array): SupportedMime | null {
  for (const { mime, bytes: signature } of SIGNATURES) {
    if (bytes.length < signature.length) continue;
    if (signature.every((byte, i) => bytes[i] === byte)) {
      return mime;
    }
  }
  return null;
}

const EXTENSIONS_BY_MIME: Record<SupportedMime, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

/** Case-insensitive; `filename` is the client-supplied original name —
 * used only for this comparison, never to build a filesystem path
 * (MASTER_PROMPT.md §9). */
export function extensionMatches(filename: string, mime: SupportedMime): boolean {
  const lower = filename.toLowerCase();
  return EXTENSIONS_BY_MIME[mime].some((ext) => lower.endsWith(ext));
}
