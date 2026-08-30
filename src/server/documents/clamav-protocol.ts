/**
 * The pure, no-I/O half of clamd's INSTREAM protocol — factored out so
 * the byte framing itself is unit-testable without a real socket (the
 * `net.connect()` half lives in clamav.ts and is exercised for real only
 * against the compose stack's `clamav` service, see docs/modules/M06.md
 * "Scope decisions").
 *
 * Wire format (https://docs.clamav.net/manual/Usage/Scanning.html#instream):
 * after the `zINSTREAM\0` command, the client sends the file as a series
 * of chunks, each a 4-byte big-endian length prefix followed by that
 * many bytes of data, terminated by a zero-length chunk.
 */

export const CLAMD_INSTREAM_COMMAND = Buffer.from("zINSTREAM\0", "ascii");

const DEFAULT_CHUNK_SIZE = 8192;

/** Splits `bytes` into clamd's length-prefixed chunk sequence, ending
 * with the zero-length terminator chunk. Returns one Buffer per chunk
 * (including the terminator) so a caller can write them individually
 * without concatenating a potentially large file into one extra copy. */
export function buildInstreamChunks(
  bytes: Uint8Array,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeUInt32BE(slice.length, 0);
    chunks.push(lengthPrefix, Buffer.from(slice));
  }
  // Zero-length terminator chunk — required even for an empty file.
  chunks.push(Buffer.from([0x00, 0x00, 0x00, 0x00]));
  return chunks;
}

export type ClamdResponse =
  | { outcome: "clean" }
  | { outcome: "infected"; signature: string }
  | { outcome: "error"; message: string };

/** Parses clamd's response line, e.g. "stream: OK", "stream: Eicar-Test
 * -Signature FOUND", "INSTREAM size limit exceeded. ERROR". Strips the
 * trailing NUL the 'z'-prefixed command variant terminates responses
 * with. */
export function parseClamdResponse(raw: string): ClamdResponse {
  const text = raw.replace(/\0+$/, "").trim();
  if (text.endsWith("OK")) {
    return { outcome: "clean" };
  }
  if (text.endsWith("FOUND")) {
    // "stream: <signature> FOUND"
    const withoutSuffix = text.replace(/\s*FOUND$/, "");
    const signature = withoutSuffix.split(":").pop()?.trim() ?? "unknown";
    return { outcome: "infected", signature };
  }
  return { outcome: "error", message: text };
}
