import { z } from "zod";

export const issueSupervisorTokenSchema = z.object({
  supervisorEmail: z.string().trim().email(),
});

export const submitEvaluationSchema = z.object({
  performanceRating: z.number().int().min(1).max(5),
  comments: z.string().trim().min(1),
});
