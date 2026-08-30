import { z } from "zod";

/** BR-22's ≥300-character circumstance and the evidence file arrive via
 * multipart FormData (the file isn't zod-friendly across that boundary,
 * same reasoning as M05's `submitOfferSchema`). */
export const initiateWaiverSchema = z.object({
  circumstance: z.string().trim().min(300),
  reason: z.string().trim().min(1),
});

export const waiverDecisionSchema = z.object({
  reason: z.string().trim().min(1),
});
