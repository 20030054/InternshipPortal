import { describe, expect, it } from "vitest";
import { parseRosterCsv } from "@/server/roster/csv-import";

const HEADER =
  "registrationNumber,email,programme,admissionSemesterType,admissionSemesterYear";

describe("parseRosterCsv", () => {
  it("parses a well-formed file into the expected rows", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,2022",
      "FA22-BSE-002,bob@example.test,BS Computer Science,SPRING,2023",
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
      },
      {
        registrationNumber: "FA22-BSE-002",
        email: "bob@example.test",
        programme: "BS Computer Science",
        admissionSemesterType: "SPRING",
        admissionSemesterYear: 2023,
      },
    ]);
  });

  it("lowercases email and normalises semester type case", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,Alice@Example.Test,BS Software Engineering,fall,2022",
    ].join("\n");

    const { rows } = parseRosterCsv(csv);
    expect(rows[0]?.email).toBe("alice@example.test");
    expect(rows[0]?.admissionSemesterType).toBe("FALL");
  });

  it("reports a row missing a required column instead of throwing", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,,FALL,2022", // missing programme
    ].join("\n");

    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("programme");
  });

  it("reports a duplicate registrationNumber within the same file, keeping only the first", () => {
    const csv = [
      HEADER,
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,2022",
      "FA22-BSE-001,someone-else@example.test,BS Computer Science,FALL,2022",
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
      "FA22-BSE-001,alice@example.test,BS Software Engineering,FALL,not-a-year",
      "FA22-BSE-002,bob@example.test,BS Computer Science,SPRING,2023",
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
      "FA22-BSE-001,alice@example.test,BS Software Engineering,WINTER,2022",
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
