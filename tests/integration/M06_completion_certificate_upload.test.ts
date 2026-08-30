import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cases/[id]/completion-certificate/route";
import { sessionState } from "./setup";
import { assignRole, createCaseFixture, createStudentFixture } from "./support/prisma-fixtures";
import { validPdfFile } from "./support/files";
import { prisma } from "@/server/db/client";

function uploadRequest(file: File | null): Request {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://test", { method: "POST", body: formData });
}

/**
 * `document.upload_completion_certificate` (M02's capability matrix),
 * wired to a real route for the first time in M06. Only ever creates a
 * `Document` row — see docs/modules/M06.md "Scope decisions" for why it
 * deliberately doesn't also advance `cases.state`.
 */
describe("M06: POST /api/cases/:id/completion-certificate", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("succeeds while IN_PROGRESS and fires no transition", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    sessionState.current = { user: { id: student.userId } };

    const response = await POST(uploadRequest(validPdfFile("certificate.pdf")), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.type).toBe("COMPLETION_CERTIFICATE");
    expect(body.status).toBe("ACTIVE");

    const refreshed = await prisma.case.findUniqueOrThrow({ where: { id: kase.id } });
    expect(refreshed.state).toBe("IN_PROGRESS");

    const events = await prisma.caseEvent.findMany({ where: { caseId: kase.id } });
    expect(events).toHaveLength(0);
  });

  it("succeeds while DOCS_PENDING too", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "DOCS_PENDING" });
    sessionState.current = { user: { id: student.userId } };

    const response = await POST(uploadRequest(validPdfFile()), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(201);
  });

  it("409s outside the uploadable states (e.g. ELIGIBLE)", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "ELIGIBLE" });
    sessionState.current = { user: { id: student.userId } };

    const response = await POST(uploadRequest(validPdfFile()), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(409);
  });

  it("404s for another student's case", async () => {
    const owner = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: owner.id, state: "IN_PROGRESS" });

    const other = await createStudentFixture();
    await assignRole(other.userId, "STUDENT");
    sessionState.current = { user: { id: other.userId } };

    const response = await POST(uploadRequest(validPdfFile()), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(404);
  });

  it("401s when unauthenticated", async () => {
    const student = await createStudentFixture();
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    sessionState.current = null;

    const response = await POST(uploadRequest(validPdfFile()), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(401);
  });

  it("400s when no file is provided", async () => {
    const student = await createStudentFixture();
    await assignRole(student.userId, "STUDENT");
    const kase = await createCaseFixture({ studentId: student.id, state: "IN_PROGRESS" });
    sessionState.current = { user: { id: student.userId } };

    const response = await POST(uploadRequest(null), {
      params: Promise.resolve({ id: kase.id }),
    });
    expect(response.status).toBe(400);
  });
});
