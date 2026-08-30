import { z } from "zod";

export const restartRequestSchema = z.object({
  newCompanyName: z.string().trim().min(1),
  newCompanyContact: z.string().trim().min(1),
  newCompanyRegistrationNumber: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1),
});

export const restartCountersignSchema = z.object({
  reason: z.string().trim().min(1),
  /** BR-17: required (and must be `true`) when the stored request's G1
   * result is flagged — see docs/modules/M10.md "Scope decisions." */
  acknowledgeFlaggedMatch: z.boolean().optional(),
});

export const restartDenySchema = z.object({
  reason: z.string().trim().min(1),
});

export const restartEscalateSchema = z.object({
  reason: z.string().trim().min(1),
  ruling: z.string().trim().min(1),
});
