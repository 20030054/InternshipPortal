import { afterEach, describe, expect, it } from "vitest";
import { POST as initiateRoute } from "@/app/api/students/[id]/waiver/route";
import { sessionState } from "./setup";
import { assignRole, createStudentFixture, createUserFixture } from "./support/prisma-fixtures";
import { VALID_CIRCUMSTANCE } from "./support/waiver-fixtures";
import { validPdfFile } from "./support/files";
import { prisma } from "@/server/db/client";

function multipart(fields: Record<string, string>, file?: File): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  if (file) fd.set("evidence", file);
  return fd;
}

async function studentWithFocal() {
  const student = await createStudentFixture();
  await assignRole(student.userId, "STUDENT");
  const focal = await createUserFixture();
  await assignRole(focal.id, "FOCAL");
  return { student, focal };
}

/** BR-21/BR-22: initiation genesis-inserts a Case in WAIVER_REQUESTED,
 * requires a >=300-char circumstance and a supporting-evidence file. */
describe("BR-21/BR-22: waiver initiation", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("succeeds: creates a Case in WAIVER_REQUESTED, a Waiver row, and a SUPPORTING_EVIDENCE document", async () => {
    const { student, focal } = await studentWithFocal();
    sessionState.current = { user: { id: focal.id } };

    const response = await initiateRoute(
      new Request("http://test", {
        method: "POST",
        body: multipart({ circumstance: VALID_CIRCUMSTANCE, reason: "on the student's behalf" }, validPdfFile()),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.case.state).toBe("WAIVER_REQUESTED");
    expect(body.waiver.outcome).toBe("PENDING");
    expect(body.waiver.focalSignerId).toBe(focal.id);

    const doc = await prisma.document.findFirstOrThrow({
      where: { caseId: body.case.id, type: "SUPPORTING_EVIDENCE" },
    });
    expect(doc.status).toBe("ACTIVE");

    const auditEvent = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "case", entityId: body.case.id, eventType: "WAIVER_INITIATED" },
    });
    expect((auditEvent.metadata as { waiverId: string }).waiverId).toBe(body.waiver.id);
  });

  it("rejects a circumstance under 300 characters", async () => {
    const { student, focal } = await studentWithFocal();
    sessionState.current = { user: { id: focal.id } };

    const response = await initiateRoute(
      new Request("http://test", {
        method: "POST",
        body: multipart({ circumstance: "too short", reason: "attempt" }, validPdfFile()),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(response.status).toBe(400);

    const cases = await prisma.case.findMany({ where: { studentId: student.id } });
    expect(cases).toHaveLength(0); // rejected before any Case row was ever created
  });

  it("rejects a missing evidence file", async () => {
    const { student, focal } = await studentWithFocal();
    sessionState.current = { user: { id: focal.id } };

    const response = await initiateRoute(
      new Request("http://test", {
        method: "POST",
        body: multipart({ circumstance: VALID_CIRCUMSTANCE, reason: "attempt" }),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("a rejected evidence file leaves no orphaned Case behind, and a retry with a valid file succeeds", async () => {
    const { student, focal } = await studentWithFocal();
    sessionState.current = { user: { id: focal.id } };

    const badFile = new File([new Uint8Array([0, 1, 2, 3])], "bad.pdf", { type: "application/pdf" });
    const rejected = await initiateRoute(
      new Request("http://test", {
        method: "POST",
        body: multipart({ circumstance: VALID_CIRCUMSTANCE, reason: "attempt" }, badFile),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(rejected.status).toBe(400); // magic-byte sniff failure

    const casesAfterRejection = await prisma.case.findMany({ where: { studentId: student.id } });
    expect(casesAfterRejection).toHaveLength(0); // no orphan left behind (D- see docs/modules/M11.md)

    const retried = await initiateRoute(
      new Request("http://test", {
        method: "POST",
        body: multipart({ circumstance: VALID_CIRCUMSTANCE, reason: "retry with a real file" }, validPdfFile()),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(retried.status).toBe(201); // not blocked by the earlier failed attempt
  });

  it("rejects when the student already has a non-terminal case", async () => {
    const { student, focal } = await studentWithFocal();
    await prisma.case.create({ data: { studentId: student.id, state: "ELIGIBLE" } });
    sessionState.current = { user: { id: focal.id } };

    const response = await initiateRoute(
      new Request("http://test", {
        method: "POST",
        body: multipart({ circumstance: VALID_CIRCUMSTANCE, reason: "attempt" }, validPdfFile()),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(response.status).toBe(409);
  });

  it("403s a non-FOCAL caller", async () => {
    const { student } = await studentWithFocal();
    sessionState.current = { user: { id: student.userId } };

    const response = await initiateRoute(
      new Request("http://test", {
        method: "POST",
        body: multipart({ circumstance: VALID_CIRCUMSTANCE, reason: "attempt" }, validPdfFile()),
      }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(response.status).toBe(403);
  });
});
