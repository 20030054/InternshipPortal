import { parse } from "csv-parse/sync";
import { prisma } from "@/server/db/client";
import type { Department, Prisma, SemesterType } from "@prisma/client";
import { generateStudentPassword } from "./credentials";
import { hashPassword } from "@/server/auth/password";

/**
 * BR-01/OQ-06: roster import, CSV only for now (the restrictive default
 * — see docs/modules/M03.md). Expected columns:
 * registrationNumber, email, programme, admissionSemesterType,
 * admissionSemesterYear, department, plus an optional fullName (M08: no
 * field anywhere stored a student's display name before the public
 * supervisor evaluation page needed one — see docs/modules/M08.md —
 * added as optional rather than required so an existing roster file
 * without this column still imports cleanly; missing fullName just
 * means the fallback display, the student's registrationNumber, keeps
 * being used).
 *
 * `department` (D-127) is required, unlike `fullName` — a student
 * imported with no department is invisible to every Focal/HoD (fail
 * closed, `requireDepartmentAccess()`), a silent gap that's better
 * caught at import time than discovered later as "why can't the Focal
 * Person see this student." Admin can still correct it after the fact
 * via `POST /api/students/:id/department` if a row was wrong.
 *
 * The semester referenced must already exist (created via the
 * semester-configuration route) — import never invents a semester on
 * the fly.
 */

const REQUIRED_COLUMNS = [
  "registrationNumber",
  "email",
  "programme",
  "admissionSemesterType",
  "admissionSemesterYear",
  "department",
] as const;

const VALID_DEPARTMENTS = ["CS", "SE", "AI", "MBC"] as const;

export type RowError = { row: number; message: string };

export type RosterRow = {
  registrationNumber: string;
  email: string;
  programme: string;
  admissionSemesterType: SemesterType;
  admissionSemesterYear: number;
  department: Department;
  fullName: string | null;
};

/**
 * Parsing only — no database access. A malformed row is reported as a
 * row-scoped error, never thrown; one bad line must not abort the whole
 * file (docs/modules/M03.md's test list).
 */
export function parseRosterCsv(content: string): {
  rows: RosterRow[];
  errors: RowError[];
} {
  let records: Array<Record<string, string>>;
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `Could not parse CSV: ${err instanceof Error ? err.message : "unknown error"}`,
        },
      ],
    };
  }

  const rows: RosterRow[] = [];
  const errors: RowError[] = [];
  const seenRegistrationNumbers = new Set<string>();

  records.forEach((record, index) => {
    const rowNumber = index + 2; // 1-indexed, plus the header row

    const missing = REQUIRED_COLUMNS.filter((col) => !record[col]?.trim());
    if (missing.length > 0) {
      errors.push({
        row: rowNumber,
        message: `Missing required column(s): ${missing.join(", ")}`,
      });
      return;
    }

    const registrationNumber = record.registrationNumber!.trim();
    if (seenRegistrationNumbers.has(registrationNumber)) {
      errors.push({
        row: rowNumber,
        message: `Duplicate registrationNumber "${registrationNumber}" within this file`,
      });
      return;
    }

    const year = Number(record.admissionSemesterYear);
    if (!Number.isInteger(year)) {
      errors.push({
        row: rowNumber,
        message: `admissionSemesterYear "${record.admissionSemesterYear}" is not a valid integer`,
      });
      return;
    }

    const type = record.admissionSemesterType!.trim().toUpperCase();
    if (type !== "FALL" && type !== "SPRING" && type !== "SUMMER") {
      errors.push({
        row: rowNumber,
        message: `admissionSemesterType "${record.admissionSemesterType}" must be FALL, SPRING, or SUMMER`,
      });
      return;
    }

    const department = record.department!.trim().toUpperCase();
    if (!VALID_DEPARTMENTS.includes(department as (typeof VALID_DEPARTMENTS)[number])) {
      errors.push({
        row: rowNumber,
        message: `department "${record.department}" must be one of ${VALID_DEPARTMENTS.join(", ")}`,
      });
      return;
    }

    seenRegistrationNumbers.add(registrationNumber);
    rows.push({
      registrationNumber,
      email: record.email!.trim().toLowerCase(),
      programme: record.programme!.trim(),
      admissionSemesterType: type,
      admissionSemesterYear: year,
      department: department as Department,
      fullName: record.fullName?.trim() || null,
    });
  });

  return { rows, errors };
}

export type NewCredential = { email: string; fullName: string | null; password: string };

export type ImportResult = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: RowError[];
  /**
   * OQ-05, answered (D-122): one entry per user who genuinely had no
   * password before this import — a real, random password, plaintext
   * here *only* in this one-time response (never persisted anywhere;
   * the DB only ever stores the Argon2 hash). Re-importing a
   * corrected file for an existing student with an existing password
   * never appears here again — that password is left untouched.
   */
  newCredentials: NewCredential[];
};

/**
 * Parses and applies a roster CSV: upserts `users`/`students` by
 * `registrationNumber`, ensures the STUDENT role, and always writes one
 * `roster_imports` row recording what happened — even a file that's
 * entirely errors produces a record, not silence.
 */
export async function importRoster(
  content: string,
  importedBy: string,
  filename: string,
): Promise<ImportResult> {
  const { rows, errors: parseErrors } = parseRosterCsv(content);
  const errors: RowError[] = [...parseErrors];
  let createdCount = 0;
  let updatedCount = 0;
  const newCredentials: NewCredential[] = [];

  const studentRole = await prisma.role.findUnique({
    where: { name: "STUDENT" },
  });

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    try {
      const semester = await prisma.semester.findUnique({
        where: {
          type_year: {
            type: row.admissionSemesterType,
            year: row.admissionSemesterYear,
          },
        },
      });
      if (!semester) {
        errors.push({
          row: rowNumber,
          message: `No semester configured for ${row.admissionSemesterType} ${row.admissionSemesterYear} — create it first`,
        });
        continue;
      }

      const existing = await prisma.student.findUnique({
        where: { registrationNumber: row.registrationNumber },
      });

      const user = await prisma.user.upsert({
        where: { email: row.email },
        // `undefined` (not `null`) when the row has no fullName --
        // Prisma leaves the column untouched on update rather than
        // clearing a real name a prior import already set.
        update: { fullName: row.fullName ?? undefined },
        create: { email: row.email, fullName: row.fullName },
      });

      // OQ-05, answered (D-122): a genuinely new login-capable
      // account gets a real, random password right here — never a
      // re-import of an existing student overwriting a password
      // that's already in real use. `passwordHash` being null is the
      // actual test, not "this row created a new Student" (a student
      // row can be re-imported/corrected while its user row already
      // has a password from an earlier import).
      if (user.passwordHash === null) {
        const rawPassword = generateStudentPassword();
        const passwordHash = await hashPassword(rawPassword);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
        newCredentials.push({ email: row.email, fullName: row.fullName, password: rawPassword });
      }

      await prisma.student.upsert({
        where: { registrationNumber: row.registrationNumber },
        update: {
          userId: user.id,
          admissionSemesterId: semester.id,
          programme: row.programme,
          department: row.department,
        },
        create: {
          userId: user.id,
          registrationNumber: row.registrationNumber,
          admissionSemesterId: semester.id,
          programme: row.programme,
          department: row.department,
        },
      });

      if (studentRole) {
        await prisma.userRole.upsert({
          where: {
            userId_roleId: { userId: user.id, roleId: studentRole.id },
          },
          update: {},
          create: { userId: user.id, roleId: studentRole.id },
        });
      }

      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  const result: ImportResult = {
    totalRows: rows.length + parseErrors.length,
    createdCount,
    updatedCount,
    errorCount: errors.length,
    errors,
    newCredentials,
  };

  await prisma.rosterImport.create({
    data: {
      importedBy,
      filename,
      totalRows: result.totalRows,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      errorCount: result.errorCount,
      errors: result.errors as unknown as Prisma.InputJsonValue,
    },
  });

  return result;
}
