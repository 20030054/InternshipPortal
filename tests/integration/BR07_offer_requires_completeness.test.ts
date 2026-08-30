import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cases/[id]/offer/route";
import { sessionState } from "./setup";
import { assignRole } from "./support/prisma-fixtures";
import { createEligibleStudent } from "./support/offer-fixtures";
import { openCase, rejectOffer } from "@/server/offers/service";
import { prisma } from "@/server/db/client";
import { validPdfFile } from "./support/files";

function offerRequest(fields: {
  companyName?: string;
  companyContact?: string;
  workDescription?: string;
  file?: File | null;
}): Request {
  const formData = new FormData();
  if (fields.companyName !== undefined) formData.append("companyName", fields.companyName);
  if (fields.companyContact !== undefined) {
    formData.append("companyContact", fields.companyContact);
  }
  if (fields.workDescription !== undefined) {
    formData.append("workDescription", fields.workDescription);
  }
  if (fields.file !== undefined && fields.file !== null) {
    formData.append("offerLetter", fields.file);
  }
  return new Request("http://test/api/cases/x/offer", {
    method: "POST",
    body: formData,
  });
}

const validFile = validPdfFile;

const validFields = {
  companyName: "Acme Corp",
  companyContact: "hr@acme.test",
  workDescription: "x".repeat(200),
};

/**
 * BR-07 (real as of M05, replacing M04's stub) — exercised through the
 * real POST /api/cases/:id/offer route, so this proves multipart
 * parsing, zod validation, and the offerComplete guard all agree.
 */
describe("BR-07: offer submission requires a complete offer", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  // File-local counter (see support/offer-fixtures.ts's doc comment on
  // why this can't live inside that shared module).
  let nextSeq = 2000;

  async function eligibleCaseAsStudent() {
    const student = await createEligibleStudent((nextSeq += 10));
    await assignRole(student.userId, "STUDENT");
    const kase = await openCase(student.id);
    sessionState.current = { user: { id: student.userId } };
    return kase.id;
  }

  it("400s on a missing offer letter file", async () => {
    const caseId = await eligibleCaseAsStudent();
    const response = await POST(offerRequest({ ...validFields, file: null }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(response.status).toBe(400);
  });

  it("400s on a missing company name (zod)", async () => {
    const caseId = await eligibleCaseAsStudent();
    const response = await POST(
      offerRequest({ ...validFields, companyName: "", file: validFile() }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(400);
  });

  it("400s on a missing company contact (zod)", async () => {
    const caseId = await eligibleCaseAsStudent();
    const response = await POST(
      offerRequest({ ...validFields, companyContact: "", file: validFile() }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(400);
  });

  it("400s on a work description under 200 characters (zod)", async () => {
    const caseId = await eligibleCaseAsStudent();
    const response = await POST(
      offerRequest({ ...validFields, workDescription: "too short", file: validFile() }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(400);
  });

  it("succeeds with every field present, landing the case on OFFER_UNDER_REVIEW", async () => {
    const caseId = await eligibleCaseAsStudent();
    const response = await POST(
      offerRequest({ ...validFields, file: validFile() }),
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // Row 3 (OFFER_SUBMITTED -> OFFER_UNDER_REVIEW, SYSTEM) chains
    // automatically -- see docs/modules/M05.md "Scope decisions."
    expect(body.state).toBe("OFFER_UNDER_REVIEW");
    expect(body.workDescription).toBe(validFields.workDescription);

    const document = await prisma.document.findFirstOrThrow({
      where: { caseId, type: "OFFER_LETTER" },
    });
    expect(document.originalFilename).toBe("offer.pdf");
    expect(document.checksumSha256).toHaveLength(64);

    const events = await prisma.caseEvent.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    });
    const [, submitted, queued] = events;
    expect(submitted?.toState).toBe("OFFER_SUBMITTED");
    expect(queued?.toState).toBe("OFFER_UNDER_REVIEW");
  });

  it("resubmission after rejection also requires completeness and works the same way", async () => {
    const caseId = await eligibleCaseAsStudent();
    const student = await prisma.case
      .findUniqueOrThrow({ where: { id: caseId } })
      .then((c) => prisma.student.findUniqueOrThrow({ where: { id: c.studentId } }));

    const first = await POST(offerRequest({ ...validFields, file: validFile() }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(first.status).toBe(200);

    const focal = await prisma.user.create({ data: { email: `focal-${caseId}@example.test` } });
    await assignRole(focal.id, "FOCAL");
    await rejectOffer({
      caseId,
      actor: { userId: focal.id, roles: ["FOCAL"] },
      reason: "not relevant to the degree",
    });

    sessionState.current = { user: { id: student.userId } };
    const missingFile = await POST(offerRequest({ ...validFields, file: null }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(missingFile.status).toBe(400);

    const resubmitted = await POST(offerRequest({ ...validFields, file: validFile() }), {
      params: Promise.resolve({ id: caseId }),
    });
    expect(resubmitted.status).toBe(200);
    const body = await resubmitted.json();
    expect(body.state).toBe("OFFER_UNDER_REVIEW");
  });
});
