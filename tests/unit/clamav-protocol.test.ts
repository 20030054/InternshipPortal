import { describe, expect, it } from "vitest";
import {
  buildInstreamChunks,
  CLAMD_INSTREAM_COMMAND,
  parseClamdResponse,
} from "@/server/documents/clamav-protocol";

describe("CLAMD_INSTREAM_COMMAND", () => {
  it("is the null-terminated zINSTREAM command", () => {
    expect(CLAMD_INSTREAM_COMMAND.toString("ascii")).toBe("zINSTREAM\0");
  });
});

describe("buildInstreamChunks", () => {
  it("wraps a small payload in one length-prefixed chunk plus the terminator", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const chunks = buildInstreamChunks(data, 8192);

    // [lengthPrefix, data, terminator]
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.readUInt32BE(0)).toBe(4);
    expect(chunks[1]!.equals(Buffer.from(data))).toBe(true);
    expect(chunks[2]!.equals(Buffer.from([0, 0, 0, 0]))).toBe(true);
  });

  it("splits a payload larger than chunkSize into multiple chunks", () => {
    const data = new Uint8Array(10).fill(0xab);
    const chunks = buildInstreamChunks(data, 4);

    // 10 bytes at chunkSize 4 -> chunks of 4, 4, 2, each with its own
    // length prefix, plus the terminator: 3 * 2 + 1 = 7 buffers.
    expect(chunks).toHaveLength(7);
    expect(chunks[0]!.readUInt32BE(0)).toBe(4);
    expect(chunks[2]!.readUInt32BE(0)).toBe(4);
    expect(chunks[4]!.readUInt32BE(0)).toBe(2);
    expect(chunks[6]!.equals(Buffer.from([0, 0, 0, 0]))).toBe(true);

    const reassembled = Buffer.concat([chunks[1]!, chunks[3]!, chunks[5]!]);
    expect(reassembled.equals(Buffer.from(data))).toBe(true);
  });

  it("produces only the terminator chunk for an empty payload", () => {
    const chunks = buildInstreamChunks(new Uint8Array([]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.equals(Buffer.from([0, 0, 0, 0]))).toBe(true);
  });
});

describe("parseClamdResponse", () => {
  it("parses a clean result", () => {
    expect(parseClamdResponse("stream: OK\0")).toEqual({ outcome: "clean" });
  });

  it("parses an infected result and extracts the signature", () => {
    expect(parseClamdResponse("stream: Eicar-Test-Signature FOUND\0")).toEqual({
      outcome: "infected",
      signature: "Eicar-Test-Signature",
    });
  });

  it("parses an error result", () => {
    expect(parseClamdResponse("INSTREAM size limit exceeded. ERROR\0")).toEqual({
      outcome: "error",
      message: "INSTREAM size limit exceeded. ERROR",
    });
  });

  it("tolerates responses without a trailing NUL", () => {
    expect(parseClamdResponse("stream: OK")).toEqual({ outcome: "clean" });
  });
});
