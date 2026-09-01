import type { Case, Department, RoleName } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { executeTransition } from "@/server/state-machine/executor";
import type { TransitionActor } from "@/server/state-machine/types";
import { countWeeksCompleted, hasReachedMidpoint } from "./summary";
import { computeDurationVariance, weeksBetween, type DurationVariance } from "./duration";

export class DuplicateWeekError extends Error {
  constructor(public readonly weekNumber: number) {
    super(`A progress log entry for week ${weekNumber} already exists.`);
    this.name = "DuplicateWeekError";
  }
}

export type Actor = { userId: string; roles: readonly RoleName[] };

/** `UNIQUE (case_id, week_number)` (the migration) is the actual
 * enforcement of "one entry per week" — this just turns the resulting
 * P2002 into a typed error instead of a raw Prisma one, same pattern as
 * every other unique-constraint-backed action in this codebase. */
export async function addProgressLogEntry(input: {
  caseId: string;
  weekNumber: number;
  note: string;
  createdBy: string;
}) {
  try {
    return await prisma.progressLogEntry.create({
      data: {
        caseId: input.caseId,
        weekNumber: input.weekNumber,
        note: input.note,
        createdBy: input.createdBy,
      },
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    ) {
      throw new DuplicateWeekError(input.weekNumber);
    }
    throw err;
  }
}

export type ProgressSummary = {
  weeksCompleted: number;
  hasReachedMidpoint: boolean;
};

/** `plannedWeeks` is passed in rather than re-derived from the case row
 * here — the caller already has the case (it had to look it up for the
 * ownership check), so re-fetching it inside this function would just
 * be a redundant query. */
async function progressSummary(caseId: string, plannedWeeks: number): Promise<ProgressSummary> {
  const entries = await prisma.progressLogEntry.findMany({
    where: { caseId },
    select: { weekNumber: true },
  });
  return {
    weeksCompleted: countWeeksCompleted(entries),
    hasReachedMidpoint: hasReachedMidpoint(entries, plannedWeeks),
  };
}

export async function getProgressLog(caseId: string) {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: { plannedStart: true, plannedEnd: true },
  });
  const entries = await prisma.progressLogEntry.findMany({
    where: { caseId },
    orderBy: { weekNumber: "asc" },
  });
  const plannedWeeks =
    kase.plannedStart && kase.plannedEnd
      ? weeksBetween(kase.plannedStart, kase.plannedEnd)
      : 0;
  return {
    entries,
    weeksCompleted: countWeeksCompleted(entries),
    hasReachedMidpoint: hasReachedMidpoint(entries, plannedWeeks),
  };
}

/** BR-08: records actual dates and fires the real `IN_PROGRESS ->
 * DOCS_PENDING` transition — see docs/modules/M07.md "Scope decisions"
 * for why these happen together, in one action. */
export async function completeInternship(input: {
  caseId: string;
  actor: Actor;
  actualStart: Date;
  actualEnd: Date;
}): Promise<Case> {
  await prisma.case.update({
    where: { id: input.caseId },
    data: { actualStart: input.actualStart, actualEnd: input.actualEnd },
  });

  const transitionActor: TransitionActor = {
    type: "user",
    userId: input.actor.userId,
    roles: input.actor.roles,
  };
  await executeTransition(input.caseId, "DOCS_PENDING", transitionActor, {
    context: {
      completion: { actualStart: input.actualStart, actualEnd: input.actualEnd },
    },
  });

  return prisma.case.findUniqueOrThrow({ where: { id: input.caseId } });
}

/** `GET /api/cases/:id`'s durationVariance field — `null` until both
 * planned and actual dates exist. */
export function durationVarianceFor(kase: {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
}): DurationVariance | null {
  if (!kase.plannedStart || !kase.plannedEnd || !kase.actualStart || !kase.actualEnd) {
    return null;
  }
  return computeDurationVariance(
    { start: kase.plannedStart, end: kase.plannedEnd },
    { start: kase.actualStart, end: kase.actualEnd },
  );
}

export type InProgressOverviewRow = ProgressSummary & {
  caseId: string;
  studentId: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
};

/** MASTER_PROMPT.md's "Focal Person overview of all in-progress
 * internships" — every IN_PROGRESS case pre-joined with its progress
 * summary in one call, rather than the N+1 requests listing cases
 * (M05's GET /api/cases?state=) then fetching each one's log
 * separately would take. */
/**
 * `departments`, when given, restricts this to only those departments'
 * cases — the same department-scoping every other Focal/HoD-facing
 * list route now applies (`allowedDepartmentsFor()`,
 * `src/server/authz/department-scope.ts`); `undefined`/omitted means
 * unfiltered, for DEAN/ADMIN callers and any pre-existing caller that
 * predates department scoping.
 */
export async function listInProgressOverview(
  departments?: readonly Department[],
): Promise<InProgressOverviewRow[]> {
  const cases = await prisma.case.findMany({
    where: {
      state: "IN_PROGRESS",
      ...(departments ? { student: { department: { in: [...departments] } } } : {}),
    },
    select: { id: true, studentId: true, plannedStart: true, plannedEnd: true },
    orderBy: { createdAt: "asc" },
  });

  const rows: InProgressOverviewRow[] = [];
  for (const kase of cases) {
    const plannedWeeks =
      kase.plannedStart && kase.plannedEnd
        ? weeksBetween(kase.plannedStart, kase.plannedEnd)
        : 0;
    const summary = await progressSummary(kase.id, plannedWeeks);
    rows.push({
      caseId: kase.id,
      studentId: kase.studentId,
      plannedStart: kase.plannedStart,
      plannedEnd: kase.plannedEnd,
      ...summary,
    });
  }
  return rows;
}
