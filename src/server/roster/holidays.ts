import { prisma } from "@/server/db/client";
import type { PublicHoliday } from "@prisma/client";

/**
 * OQ-14, answered (D-121): Admin-managed, not hardcoded — Pakistan's
 * public holidays include lunar-calendar Islamic dates (Eid-ul-Fitr,
 * Eid-ul-Adha, Ashura, ...) that shift every year and can't be
 * reliably computed years in advance, so a fixed table baked into the
 * codebase would inevitably go stale. Fixed civil-calendar dates are
 * seeded once (`prisma/seed.ts`) purely as a starting point; every
 * date, seeded or Admin-added, is equally editable from here on.
 */
export async function addHoliday(date: Date, name: string): Promise<PublicHoliday> {
  return prisma.publicHoliday.create({ data: { date, name } });
}

export async function removeHoliday(id: string): Promise<void> {
  await prisma.publicHoliday.delete({ where: { id } });
}

export async function listHolidays(): Promise<PublicHoliday[]> {
  return prisma.publicHoliday.findMany({ orderBy: { date: "asc" } });
}

/** `YYYY-MM-DD` strings, the exact shape `focal-sla.ts`'s
 * `workingDaysElapsed()`/`isFocalSlaBreached()` compare against — one
 * query per sweep/dashboard-load, never per-case, to avoid an N+1. */
export async function listHolidayDateStrings(): Promise<ReadonlySet<string>> {
  const rows = await prisma.publicHoliday.findMany({ select: { date: true } });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}
