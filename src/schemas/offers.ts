import { z } from "zod";

/** BR-07's file (`offerLetter`) arrives via multipart FormData, not this
 * schema — File isn't a zod-friendly shape across the fetch/FormData
 * boundary the way plain strings are, and the route already has to
 * special-case `formData.get()` the way M03's roster import route does. */
export const submitOfferSchema = z.object({
  companyName: z.string().trim().min(1),
  companyContact: z.string().trim().min(1),
  workDescription: z.string().min(200),
});

export const approveOfferSchema = z.object({
  reason: z.string().trim().min(1),
  plannedStart: z.string().date(),
  plannedEnd: z.string().date(),
  relevanceConfirmed: z.literal(true),
});

export const rejectOfferSchema = z.object({
  reason: z.string().trim().min(1),
});
