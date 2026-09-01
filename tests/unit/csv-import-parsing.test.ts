import { describe, expect, it } from "vitest";
import { parseRosterCsv } from "@/server/roster/csv-import";

const HEADER =
  "registrationNumber,email,programme,admissionSemesterType,admissionSemesterYear,department";

describe("parseRosterCsv", () => {
  it("parses a well-formed file into the expected rows", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,2022,SE",
      "FA22-BSE-002,bob@example.test,BS Computer Science,SPRING,2023,CS",
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        registrationNumber: "FA22-BSE-001",
        email: "alice@example.test",
        programme: "BS Software Engineering",
        admissionSemesterType: "FALL",
        admissionSemesterYear: 2022,
        department: "SE",
        fullName: null,
      },
      {
        registrationNumber: "FA22-BSE-002",
        email: "bob@example.test",
        programme: "BS Computer Science",
        admissionSemesterType: "SPRING",
        admissionSemesterYear: 2023,
        department: "CS",
        fullName: null,
      },
    ]);
  });

  it("captures fullName when the (optional, M08) column is present", () => {
    const csv = [
      `${HEADER},fullName`,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,2022,SE,Alice Example",
    ].join("\n");

    const { rows } = parseRosterCsv(csv);
    expect(rows[0]?.fullName).toBe("Alice Example");
  });

  it("lowercases email, normalises semester type case, and uppercases department", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,Alice@Example.Test,BS Software Engineering,fall,2022,se",
    ].join("\n");

    const { rows } = parseRosterCsv(csv);
    expect(rows[0]?.email).toBe("alice@example.test");
    expect(rows[0]?.admissionSemesterType).toBe("FALL");
    expect(rows[0]?.department).toBe("SE");
  });

  it("reports a row missing a required column instead of throwing", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,,FALL,2022,SE", // missing programme
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("programme");
  });

  it("reports a row missing the department column instead of throwing (D-127)", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,2022,", // missing department
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("department");
  });

  it("reports an invalid department (D-127)", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,2022,MATH",
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toContain("MATH");
  });

  it("reports a duplicate registrationNumber within the same file, keeping only the first", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,2022,SE",
      "FA22-BSE-001,someone-else@example.test,BS Computer Science,FALL,2022,CS",
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("alice@example.test");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Duplicate");
  });

  it("reports an invalid admissionSemesterYear without aborting other rows", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,not-a-year,SE",
      "FA22-BSE-002,bob@example.test,BS Computer Science,SPRING,2023,CS",
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.registrationNumber).toBe("FA22-BSE-002");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.row).toBe(2);
  });

  it("reports an invalid admissionSemesterType", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,WINTER,2022,SE",
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toContain("WINTER");
  });

  it("does not throw on completely unparsable input", () => {
    expect(() => parseRosterCsv('"unterminated quote')).not.toThrow();
    const { errors } = parseRosterCsv('"unterminated quote');
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns no rows and no errors for an empty (header-only) file", () => {
    const { rows, errors } = parseRosterCsv(HEADER);
    expect(rows).toEqual([]);
    expect(errors).toEqual([]);
  });
});
