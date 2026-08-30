import { z } from "zod";

export const createSemesterSchema = z.object({
  type: z.enum(["FALL", "SPRING", "SUMMER"]),
  year: z.number().int().min(2000).max(2100),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  documentDeadline: z.string().date().nullable().optional(),
  sequenceNumber: z.number().int().positive().optional(),
});
