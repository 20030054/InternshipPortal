import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/admin/semesters/route";
import { POST as openRoute } from "@/app/api/admin/semesters/[id]/open/route";
import { POST as closeRoute } from "@/app/api/admin/semesters/[id]/close/route";
import { prisma } from "@/server/db/client";
import { sessionState } from "./setup";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";

describe("M03: semester admin routes", () => {
  // Shares one database with every other integration test file (see
  // M03_semester_open_close_exclusivity.test.ts's identical comment) — a
  // clean slate here, not an assumed one.
  //
  // The semester this file creates and closes goes through the real
  // POST /api/admin/semesters route, which assigns sequenceNumber via
  // production's own nextSequenceNumber() (always above the current
  // global max) — unlike the exclusivity file, there's no low-number
  // override to give it without changing that route's contract. Safe
  // today only because this filename sorts after
  // M03_eligibility_route_ownership.test.ts and BR02_auto_enrollment_
  // sweep.test.ts alphabetically, and vitest.integration.config.ts's
  // sequencer now pins file execution to that order (see its comment
  // for the real bug this guards against).
  beforeEach(async () => {
    await prisma.semester.updateMany({
      where: { status: "OPEN" },
      data: { status: "CLOSED" },
    });
  });

  afterEach(() => {
    sessionState.current = null;
  });

  it("GET/POST /api/admin/semesters reject a non-Admin session", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    expect((await GET()).status).toBe(403);
    expect(
      (
        await POST(
          new Request("http://test/api/admin/semesters", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "FALL",
              year: 9999,
              startsOn: "2099-09-01",
              endsOn: "2099-12-31",
            }),
          }),
        )
      ).status,
    ).toBe(403);
  });

  it("Admin can create a semester, then open it, then close it", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    // This test goes through the real route, which validates `year`
    // against the schema's realistic bound (createSemesterSchema caps at
    // 2100) — unlike prisma-fixtures.ts's createSemesterFixture, which
    // bypasses Zod entirely and can use an arbitrarily large range for
    // collision avoidance. A modest random window here accepts a small
    // repeat-local-run collision risk in exchange for a realistic value.
    const year = 2030 + Math.floor(Math.random() * 70);
    const createResponse = await POST(
      new Request("http://test/api/admin/semesters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "FALL",
          year,
          startsOn: "2099-09-01",
          endsOn: "2099-12-31",
        }),
      }),
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.status).toBe("UPCOMING");

    const openResponse = await openRoute(new Request("http://test"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(openResponse.status).toBe(200);
    const opened = await openResponse.json();
    expect(opened.status).toBe("OPEN");

    const closeResponse = await closeRoute(new Request("http://test"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(closeResponse.status).toBe(200);
    const closed = await closeResponse.json();
    expect(closed.status).toBe("CLOSED");
  });

  it("opening a non-existent semester returns 404, not a 500", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const response = await openRoute(new Request("http://test"), {
      params: Promise.resolve({
        id: "00000000-0000-7000-8000-000000000000",
      }),
    });
    expect(response.status).toBe(404);
  });
});
