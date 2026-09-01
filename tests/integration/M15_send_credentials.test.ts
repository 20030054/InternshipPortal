import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "@/server/mail/transport";
import { POST } from "@/app/api/admin/roster/send-credentials/route";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

function jsonRequest(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** OQ-05, answered (D-122): the second half of the credentials
 * workflow — see `M03_roster_import.test.ts` for the generation half. */
describe("D-122: POST /api/admin/roster/send-credentials (OQ-05)", () => {
  afterEach(() => {
    sessionState.current = null;
    vi.mocked(sendMail).mockClear();
  });

  it("sends one email per recipient, reporting per-recipient success", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const response = await POST(
      jsonRequest({
        recipients: [
          { email: "a@example.test", password: "abc123xyz789" },
          { email: "b@example.test", password: "def456uvw012" },
        ],
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([
      { email: "a@example.test", sent: true },
      { email: "b@example.test", sent: true },
    ]);
    expect(sendMail).toHaveBeenCalledTimes(2);
    // The actual password reaches the email body, not a link.
    expect(vi.mocked(sendMail).mock.calls[0]![0]).toMatchObject({
      to: "a@example.test",
    });
    expect((vi.mocked(sendMail).mock.calls[0]![0] as { text: string }).text).toContain(
      "abc123xyz789",
    );
  });

  it("an unreachable relay produces a per-recipient failure, not a 500 for the whole batch", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("relay unreachable"));

    const response = await POST(
      jsonRequest({ recipients: [{ email: "fails@example.test", password: "abc123xyz789" }] }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([{ email: "fails@example.test", sent: false }]);
  });

  it("rejects a non-Admin session with 403", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await POST(
      jsonRequest({ recipients: [{ email: "x@example.test", password: "abc123xyz789" }] }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects an empty recipients array", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const response = await POST(jsonRequest({ recipients: [] }));
    expect(response.status).toBe(400);
  });
});
