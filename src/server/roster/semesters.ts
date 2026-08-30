import { prisma } from "@/server/db/client";
import type { Semester, SemesterType } from "@prisma/client";

/**
 * MASTER_PROMPT.md §2.6: "open/close semesters" is the Admin-operated
 * mechanism for "what semester is it now" — see docs/modules/M03.md's
 * "Scope decisions" for why this isn't inferred from today's date.
 */

async function nextSequenceNumber(): Promise<number> {
  const max = await prisma.semester.aggregate({
    _max: { sequenceNumber: true },
  });
  return (max._max.sequenceNumber ?? 0) + 1;
}

export async function createSemester(input: {
  type: SemesterType;
  year: number;
  startsOn: Date;
  endsOn: Date;
  documentDeadline?: Date | null;
  /** Explicit override for backfilling history out of chronological
   * creation order; defaults to the next integer after the current max. */
  sequenceNumber?: number;
}): Promise<Semester> {
  const sequenceNumber = input.sequenceNumber ?? (await nextSequenceNumber());
  return prisma.semester.create({
    data: {
      type: input.type,
      year: input.year,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      documentDeadline: input.documentDeadline ?? null,
      sequenceNumber,
    },
  });
}

/**
 * Opens this semester and closes whichever one was previously OPEN, in
 * one transaction. The partial unique index
 * (semesters_at_most_one_open) is the actual guarantee under
 * concurrency — this transaction is what makes the common case atomic,
 * not what makes the invariant true.
 */
export async function openSemester(semesterId: string): Promise<Semester> {
  return prisma.$transaction(async (tx) => {
    await tx.semester.updateMany({
      where: { status: "OPEN" },
      data: { status: "CLOSED" },
    });
    return tx.semester.update({
      where: { id: semesterId },
      data: { status: "OPEN" },
    });
  });
}

/** Closes a semester without opening another — end of an academic year,
 * before the next term's semester exists yet. */
export async function closeSemester(semesterId: string): Promise<Semester> {
  return prisma.semester.update({
    where: { id: semesterId },
    data: { status: "CLOSED" },
  });
}
