import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";

/**
 * Shared by the (future) client-side form and the route handler, per
 * CONVENTIONS.md — one schema, not two copies that can drift.
 */

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});
