import { z } from "zod";

export const createHolidaySchema = z.object({
  date: z.string().date(),
  name: z.string().min(1).max(200),
});
