import { z } from "zod";

export const verifyDocumentSchema = z.object({
  method: z.enum([
    "DOCUMENT_INSPECTED",
    "EMPLOYER_CONTACTED_PHONE",
    "EMPLOYER_CONTACTED_EMAIL",
    "SUPERVISOR_LINK_CONFIRMED",
  ]),
  note: z.string().trim().min(1).optional(),
});

export const recommendGradeSchema = z.object({
  value: z.enum(["P", "I"]),
  reason: z.string().trim().min(1),
});

/** `reason` is optional at the schema level — BR-14/M04's row 12
 * (`CLOSED_PASS`) requires none, row 13 (`CLOSED_INCOMPLETE`) does. The
 * route/executor enforce that distinction; this schema just accepts
 * either shape. */
export const awardGradeSchema = z.object({
  value: z.enum(["P", "I"]),
  reason: z.string().trim().min(1).optional(),
});

export const reverseGradeSchema = z.object({
  reason: z.string().trim().min(1),
});
