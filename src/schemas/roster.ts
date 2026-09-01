import { z } from "zod";

export const createSemesterSchema = z.object({
  type: z.enum(["FALL", "SPRING", "SUMMER"]),
  year: z.number().int().min(2000).max(2100),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  documentDeadline: z.string().date().nullable().optional(),
  sequenceNumber: z.number().int().positive().optional(),
});

/**
 * OQ-01, answered: the deadline set at creation is deliberately not
 * final — an Admin can change it later (a submission window extended,
 * a date set wrong the first time). Same shape as `createSemesterSchema`'s
 * own field: an absent key or `null` both mean "clear it back to unset,"
 * matching BR-05's own "no deadline configured -> sweep stays dormant"
 * reading (`isPastDocumentDeadline()`'s null check) — un-setting a
 * deadline is exactly as legitimate an edit as setting one.
 */
export const updateSemesterDeadlineSchema = z.object({
  documentDeadline: z.string().date().nullable().optional(),
});
