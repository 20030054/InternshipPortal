import type { RoleName } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { issuePasswordResetToken } from "@/server/auth/password-reset";
import { staffWelcomeEmail } from "@/server/mail/staff-welcome-email";
import { sendMail } from "@/server/mail/transport";

/**
 * M14: §2.6 ("Registrar/Admin... create and deactivate user accounts")
 * and the `users.manage` capability's own name (src/server/authz/
 * matrix.ts) both existed since M02/M03, but no route ever called
 * either half of it — a real gap found auditing for this module's
 * §8.3 runbook requirement ("onboarding a new Focal Person"), not a
 * testing oversight. See docs/modules/M14.md.
 */

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("A user with this email address already exists.");
    this.name = "EmailAlreadyInUseError";
  }
}

/**
 * Creates a new staff account with no password set (`passwordHash`
 * stays null) and immediately issues a password-reset-shaped onboarding
 * link — `authorizeCredentials()` (M02) already treats a null
 * `passwordHash` exactly like a wrong password, so the account simply
 * cannot be logged into until this link is redeemed. Reuses M02's real
 * `issuePasswordResetToken()`/redeem flow rather than inventing a
 * separate "set your initial password" mechanism.
 *
 * Roles are looked up, never created: `Role` rows are a fixed lookup
 * seeded once by `prisma/seed.ts` (see prisma/schema.prisma's own
 * comment on `model Role` — "no route anywhere in the system writes to
 * this table") — a `roleName` this call can't find means the
 * deployment was never seeded, a real operational error, not something
 * to paper over by creating the row here.
 */
export async function createStaffUser(input: {
  email: string;
  roles: readonly RoleName[];
  fullName?: string;
}): Promise<{ id: string; email: string; roles: RoleName[]; emailSent: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new EmailAlreadyInUseError();
  }

  const roleRows = await Promise.all(
    input.roles.map((roleName) => prisma.role.findUniqueOrThrow({ where: { name: roleName } })),
  );

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email: input.email, fullName: input.fullName ?? null },
    });
    await tx.userRole.createMany({
      data: roleRows.map((role) => ({ userId: created.id, roleId: role.id })),
    });
    return created;
  });

  const rawToken = await issuePasswordResetToken(user.id);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${rawToken}`;
  const { subject, text } = staffWelcomeEmail(resetUrl);

  // M15: found live-verifying this route the same way D-103 found the
  // identical bug in the supervisor-token route — an unhandled
  // `sendMail()` rejection against an unreachable SMTP relay 500'd the
  // whole request even though the account itself was already fully
  // created and usable. Unlike D-103's route, this one has no safe
  // "just call it again" retry (`createStaffUser` rejects a second
  // call for the same email with `EmailAlreadyInUseError` — the
  // account, correctly, isn't recreated). The honest response is a
  // real success, not an error: the account exists and works exactly
  // as designed, the new holder just needs a fresh link, which the
  // portal's own "forgot password" flow already gives any account
  // with no `passwordHash` (verified true in D-091's own reasoning) —
  // `emailSent: false` tells the caller that's the recovery path
  // needed here, rather than treating this like a failure that leaves
  // the account in some unknown state.
  let emailSent = true;
  try {
    await sendMail({ to: user.email, subject, text });
  } catch {
    emailSent = false;
  }

  return { id: user.id, email: user.email, roles: input.roles.slice() as RoleName[], emailSent };
}

/**
 * Sets `disabledAt`. That single column is already the whole mechanism:
 * `authorizeCredentials()` refuses a disabled account outright, and
 * `loadIdentity()` — read fresh on every single request via the `jwt`
 * callback, not just at sign-in — returns null for one too, which the
 * callback treats as "invalidate the session outright" (M02). A
 * currently-open session for this user stops working on its very next
 * request; no separate `tokenVersion` bump is needed on top of that.
 */
export async function deactivateUser(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { disabledAt: new Date() },
  });
}

/**
 * The companion `deactivateUser()` never had — clearing `disabledAt`
 * is the whole mechanism in reverse: `authorizeCredentials()` and
 * `loadIdentity()` both key off it being non-null, so setting it back
 * to null on its own is sufficient. Doesn't touch `tokenVersion` or
 * anything else — a reactivated account still needs a fresh sign-in
 * (no session survived being disabled to resume).
 */
export async function reactivateUser(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { disabledAt: null },
  });
}
