import { connect } from "node:net";
import {
  buildInstreamChunks,
  CLAMD_INSTREAM_COMMAND,
  parseClamdResponse,
} from "./clamav-protocol";

/**
 * Real I/O against the `clamav` compose service (docker-compose.yml —
 * no published ports, reached by service name on the internal network).
 * Mocked in the fast test suite (tests/integration/setup.ts) since
 * spinning up a real ClamAV daemon per test run is impractical (its
 * virus database load takes minutes on first boot) — proven for real
 * only via this module's `docker compose` verification, including a
 * genuine EICAR positive. See docs/modules/M06.md "Scope decisions."
 */

export class InfectedFileError extends Error {
  constructor(public readonly signature: string) {
    super(`File rejected by virus scan: ${signature}`);
    this.name = "InfectedFileError";
  }
}

export class ScanUnavailableError extends Error {
  constructor(reason: string) {
    super(`Virus scan could not be completed: ${reason}`);
    this.name = "ScanUnavailableError";
  }
}

function clamdHost(): string {
  const host = process.env.CLAMAV_HOST;
  if (!host) {
    throw new ScanUnavailableError("CLAMAV_HOST is not set");
  }
  return host;
}

function clamdPort(): number {
  return Number(process.env.CLAMAV_PORT ?? 3310);
}

const SCAN_TIMEOUT_MS = 30_000;

/** Scans `bytes` via clamd's INSTREAM command. Resolves silently for a
 * clean file; throws `InfectedFileError` for a detected signature or
 * `ScanUnavailableError` for anything else that went wrong (connection
 * refused, timeout, a malformed response) — the upload fails closed in
 * every one of those cases, never open. */
export async function scanBuffer(bytes: Uint8Array): Promise<void> {
  const host = clamdHost();
  const port = clamdPort();

  const response = await new Promise<string>((resolve, reject) => {
    const socket = connect({ host, port });
    let responseData = "";
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    socket.setTimeout(SCAN_TIMEOUT_MS, () => fail(new Error("scan timed out")));
    socket.on("error", (err) => fail(err));

    socket.on("connect", () => {
      socket.write(CLAMD_INSTREAM_COMMAND);
      for (const chunk of buildInstreamChunks(bytes)) {
        socket.write(chunk);
      }
    });

    socket.on("data", (data) => {
      responseData += data.toString("utf8");
    });

    socket.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(responseData);
    });
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    throw new ScanUnavailableError(message);
  });

  const parsed = parseClamdResponse(response);
  if (parsed.outcome === "infected") {
    throw new InfectedFileError(parsed.signature);
  }
  if (parsed.outcome === "error") {
    throw new ScanUnavailableError(parsed.message);
  }
}
