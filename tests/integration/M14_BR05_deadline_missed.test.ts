import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  findDeadlineMissedCases,
  runDeadlineSweep,
} from "@/server/roster/deadline-sweep";
import { closeSemester, createSemester, openSemester } from "@/server/roster/semesters";
import { assignRole, createUserFixture } from "./support/prisma-fixtures";
import { createDocsPendingCase, createVerifiedCase } from "./support/case-lifecycle";
import { prisma } from "@/server/db/client";
import { sessionState } from "./setup";

vi.mock("@/server/mail/transport", () => ({
  sendMail: vi.fn(async () => undefined),
}));

/**
 * BR-05: "Each semester... has a configured document submission
 * deadline. Cases missing deliverables at that deadline are flagged,
 * not auto-failed." A real gap found auditing for M14's own
 * done-criterion — `semesters.document_deadline` has existed since M01
 * with no sweep ever built against it. See docs/modules/M14.md and
 * `src/server/roster/deadline-sweep.ts`.
 *
 * `findDeadlineMissedCases()` is deliberately unscoped by semester —
 * it flags every case still missing a deliverable once the *currently
 * OPEN* semester's deadline has passed, matching how BR-27's own sweep
 * and M13's dashboard already treat "still in progress" as a global
 * cut, not a per-semester one. Assertions below check "contains"/"does
 * not contain" on this test's own case ids rather than exact list
 * lengths, the same defensive pattern BR27_focal_sla_escalation.test.ts
 * uses, since this suite's other files may leave cases sitting in a
 * pre-verification state in the shared database.
 *
 * File naming, deliberately: this file both opens new semesters and
 * creates real cases (via `createDocsPendingCase()`/`createVerifiedCase()`,
 * which route through `openCase()`'s BR-01 eligibility guard) — every
 * one of those closed semesters counts, globally and unscoped, toward
 * *any other* test's eligibility/G2 math for a lower admission point.
 * The only structural fix is running after every test that computes
 * eligibility at all, not picking "a high enough" numeric block — see
 * `M14_BR03_graduation_eligibility.test.ts`'s own comment for the full
 * reasoning (including the two real failure modes a numeric-block-only
 * fix still hit). Hence the `M14_` filename prefix, sorting after
 * every "BR"/"M0x"/"M1x" file and before the lowercase
 * `extra_constraints`/`schema`/`seed` sanity files (none of which
 * touch semester counts). `CASE_BLOCK`/`SEMESTER_BLOCK` only need to
 * avoid colliding with an exact value some earlier file already
 * inserted — 750,000,000+ clears M13_dean_dashboard's 500,000,000 and
 * M13_student_dashboard's 600,000,000, and M14_BR03's own
 * 700,000,000-799,999,999 span.
 */
const CASE_BLOCK = 850_000_000;
const SEMESTER_BLOCK = 860_000_000;
describe("BR-05: document-deadline sweep", () => {
  afterEach(() => {
    sessionState.current = null;
  });

  // This is the one file in the suite that deliberately opens real
  // semesters (see the file-naming comment above) — leaving one OPEN
  // when the file finishes would break `semesters_at_most_one_open`
  // for whatever runs after it (seed.test.ts's own semester upsert,
  // hit for real while building this test: it tries to seed its own
  // OPEN semester and collides with one left behind here). Restore the
  // "no OPEN semester" state this file itself found things in.
  afterAll(async () => {
    const stillOpen = await prisma.semester.findMany({ where: { status: "OPEN" } });
    for (const s of stillOpen) {
      await closeSemester(s.id);
    }
  });

  it("flags nothing when there is no OPEN semester at all", async () => {
    // This file runs dead last (see the file-naming comment above), so
    // an earlier-sorting file (M03_semester_open_close_exclusivity.test.ts
    // and M03_semester_admin_routes.test.ts both genuinely open real
    // semesters, some of which they never close again) may well have
    // left one OPEN — close it explicitly rather than assuming a clean
    // slate, so this test proves the "no OPEN semester" case on
    // purpose, not by accident of run order.
    const stillOpen = await prisma.semester.findMany({ where: { status: "OPEN" } });
    for (const s of stillOpen) {
      await closeSemester(s.id);
    }

    const openSemesterRow = await prisma.semester.findFirst({ where: { status: "OPEN" } });
    expect(openSemesterRow).toBeNull();

    const result = await findDeadlineMissedCases(new Date());
    expect(result).toEqual([]);
  });

  it("flags nothing when the OPEN semester has no configured deadline (OQ-01 default)", async () => {
    const semester = await createSemester({
      type: "FALL",
      year: SEMESTER_BLOCK + 10,
      sequenceNumber: SEMESTER_BLOCK + 10,
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-05-01"),
      documentDeadline: null,
    });
    await openSemester(semester.id);

    const result = await findDeadlineMissedCases(new Date());
    expect(result).toEqual([]);
  });

  it("flags nothing before the deadline has actually passed", async () => {
    const deadline = new Date("2026-06-01T00:00:00Z");
    const semester = await createSemester({
      type: "FALL",
      year: SEMESTER_BLOCK + 20,
      sequenceNumber: SEMESTER_BLOCK + 20,
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-07-01"),
      documentDeadline: deadline,
    });
    await openSemester(semester.id);
    const { caseId } = await createDocsPendingCase(CASE_BLOCK);

    const result = await findDeadlineMissedCases(new Date("2026-05-31T00:00:00Z"));
    expect(result.map((r) => r.caseId)).not.toContain(caseId);
  });

  it("flags a case still missing a deliverable once the deadline has passed", async () => {
    const deadline = new Date("2020-01-01T00:00:00Z"); // already long past
    const semester = await createSemester({
      type: "FALL",
      year: SEMESTER_BLOCK + 30,
      sequenceNumber: SEMESTER_BLOCK + 30,
      startsOn: new Date("2019-09-01"),
      endsOn: new Date("2019-12-31"),
      documentDeadline: deadline,
    });
    await openSemester(semester.id);
    const { caseId } = await createDocsPendingCase(CASE_BLOCK + 100);

    const result = await findDeadlineMissedCases(new Date());
    const row = result.find((r) => r.caseId === caseId);
    expect(row).toBeDefined();
    expect(row?.semesterId).toBe(semester.id);
    expect(row?.studentName).toBeTruthy();
  });

  it("does not flag a case that already reached PENDING_VERIFICATION — no deliverable is missing", async () => {
    // Reuses the deadline-in-the-past OPEN semester left by the
    // previous test — deliberately, to prove this is a per-case state
    // check, not something that only looks at freshly-created cases.
    const { caseId } = await createVerifiedCase(CASE_BLOCK + 200);

    const result = await findDeadlineMissedCases(new Date());
    expect(result.map((r) => r.caseId)).not.toContain(caseId);
  });

  it("runDeadlineSweep sends one notification per FOCAL user, and does not duplicate on a re-run", async () => {
    // Explicit generous timeout (the suite default is 20s): this file
    // runs at the tail of the whole shared-database suite (see the
    // file-naming comment above), so `runDeadlineSweep()` here
    // genuinely processes every pre-verification case and every FOCAL
    // user *this entire suite has ever created* — real, bounded work
    // (`mapWithConcurrency`, M14, in @/server/notifications/service),
    // not a hang, but a lot more of it than a real SCIT deployment's
    // actual FOCAL headcount would ever produce. Called twice
    // (send, then re-run to prove dedup), doubling the cost.
    const semester = await createSemester({
      type: "FALL",
      year: SEMESTER_BLOCK + 40,
      sequenceNumber: SEMESTER_BLOCK + 40,
      startsOn: new Date("2019-09-01"),
      endsOn: new Date("2019-12-31"),
      documentDeadline: new Date("2020-01-01T00:00:00Z"),
    });
    await openSemester(semester.id);
    const { caseId } = await createDocsPendingCase(CASE_BLOCK + 300);

    const focal = await createUserFixture();
    await assignRole(focal.id, "FOCAL");

    const first = await runDeadlineSweep(new Date());
    expect(first.caseIds).toContain(caseId);

    const focalUser = await prisma.user.findUniqueOrThrow({ where: { id: focal.id } });
    const notification = await prisma.notification.findFirst({
      where: { caseId, templateId: "deadline-missed", recipient: focalUser.email },
    });
    expect(notification?.status).toBe("SENT");

    const countAfterFirstRun = await prisma.notification.count({
      where: { caseId, templateId: "deadline-missed" },
    });

    const second = await runDeadlineSweep(new Date());
    expect(second.caseIds).not.toContain(caseId);

    const countAfterRerun = await prisma.notification.count({
      where: { caseId, templateId: "deadline-missed" },
    });
    expect(countAfterRerun).toBe(countAfterFirstRun); // unchanged, not duplicated

    // Never transitions the case — "flagged, not auto-failed" holds by
    // construction (deadline-sweep.ts never calls executeTransition()),
    // confirmed here against the real row, not just by code inspection.
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.state).toBe("DOCS_PENDING");
  }, 120_000);
});
