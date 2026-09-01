import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/admin/roster/import/route";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/auth/password";
import { sessionState } from "./setup";
import {
  assignRole,
  createSemesterFixture,
  createUserFixture,
} from "./support/prisma-fixtures";

function csvRequest(content: string, filename = "roster.csv"): Request {
  const formData = new FormData();
  formData.append(
    "file",
    new File([content], filename, { type: "text/csv" }),
  );
  return new Request("http://test/api/admin/roster/import", {
    method: "POST",
    body: formData,
  });
}

describe("M03: POST /api/admin/roster/import", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  it("rejects a non-Admin session with 403", async () => {
    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");
    sessionState.current = { user: { id: focal.id } };

    const response = await POST(csvRequest("registrationNumber,email,programme,admissionSemesterType,admissionSemesterYear\n"));
    expect(response.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    sessionState.current = null;
    const response = await POST(csvRequest("x\n"));
    expect(response.status).toBe(401);
  });

  it("creates new students, is idempotent on re-import, and records a roster_imports row", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const semester = await createSemesterFixture({
      type: "FALL",
      year: 9001,
    });

    const csv = [
      "registrationNumber,email,programme,admissionSemesterType,admissionSemesterYear,department",
      `M03IMP-001,m03imp001@example.test,BS Computer Science,FALL,${semester.year},CS`,
      `M03IMP-002,m03imp002@example.test,BS Software Engineering,FALL,${semester.year},SE`,
    ].join("\n");

    const first = await POST(csvRequest(csv, "roster-1.csv"));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.createdCount).toBe(2);
    expect(firstBody.updatedCount).toBe(0);
    expect(firstBody.errorCount).toBe(0);

    const studentsAfterFirst = await prisma.student.findMany({
      where: { registrationNumber: { in: ["M03IMP-001", "M03IMP-002"] } },
    });
    expect(studentsAfterFirst).toHaveLength(2);

    // Re-importing the same file updates, not duplicates.
    const second = await POST(csvRequest(csv, "roster-2.csv"));
    const secondBody = await second.json();
    expect(secondBody.createdCount).toBe(0);
    expect(secondBody.updatedCount).toBe(2);

    const studentsAfterSecond = await prisma.student.findMany({
      where: { registrationNumber: { in: ["M03IMP-001", "M03IMP-002"] } },
    });
    expect(studentsAfterSecond).toHaveLength(2);

    const imports = await prisma.rosterImport.findMany({
      where: { importedBy: admin.id },
      orderBy: { createdAt: "asc" },
    });
    expect(imports).toHaveLength(2);
    expect(imports[0]?.filename).toBe("roster-1.csv");
    expect(imports[1]?.filename).toBe("roster-2.csv");
  });

  it("OQ-05, answered (D-122): generates a real, working password for a newly-created student, never regenerates on re-import", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const semester = await createSemesterFixture({ type: "SPRING", year: 9002 });
    const csv = [
      "registrationNumber,email,programme,admissionSemesterType,admissionSemesterYear,department",
      `M03CRED-001,m03cred001@example.test,BS Computer Science,SPRING,${semester.year},CS`,
    ].join("\n");

    const first = await POST(csvRequest(csv, "roster-cred-1.csv"));
    const firstBody = await first.json();
    expect(firstBody.newCredentials).toHaveLength(1);
    const credential = firstBody.newCredentials[0];
    expect(credential.email).toBe("m03cred001@example.test");
    expect(credential.password.length).toBeGreaterThanOrEqual(12);

    // The generated password is real -- it actually verifies against
    // the hash that got stored, not just present in the response.
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "m03cred001@example.test" },
    });
    expect(user.passwordHash).not.toBeNull();
    expect(await verifyPassword(user.passwordHash!, credential.password)).toBe(true);

    // Re-importing the same row (now with a real password already set)
    // never regenerates -- newCredentials is empty, the password is
    // untouched.
    const second = await POST(csvRequest(csv, "roster-cred-2.csv"));
    const secondBody = await second.json();
    expect(secondBody.newCredentials).toHaveLength(0);

    const userAfterReimport = await prisma.user.findUniqueOrThrow({
      where: { email: "m03cred001@example.test" },
    });
    expect(userAfterReimport.passwordHash).toBe(user.passwordHash);
  });

  it("reports a row referencing an unconfigured semester as a row error, not a thrown exception", async () => {
    const admin = await createUserFixture();
    await assignRole(admin.id, "ADMIN");
    sessionState.current = { user: { id: admin.id } };

    const csv = [
      "registrationNumber,email,programme,admissionSemesterType,admissionSemesterYear,department",
      "M03IMP-999,m03imp999@example.test,BS Computer Science,FALL,1899,CS",
    ].join("\n");

    const response = await POST(csvRequest(csv));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.createdCount).toBe(0);
    expect(body.errorCount).toBe(1);
    expect(body.errors[0].message).toContain("No semester configured");
  });
});
