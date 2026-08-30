import { z } from "zod";

export const addProgressLogEntrySchema = z.object({
  weekNumber: z.number().int().min(1),
  note: z.string().trim().min(1),
});

export const completeInternshipSchema = z.object({
  actualStart: z.string().date(),
  actualEnd: z.string().date(),
});
