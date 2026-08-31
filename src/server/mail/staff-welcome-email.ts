/**
 * M14: sent once, when an Admin creates a new staff (Focal/HoD/Dean/
 * Admin) account — see src/server/users/service.ts's createStaffUser().
 * Deliberately a separate function from password-reset-email.ts's
 * passwordResetEmail(), even though the mechanism underneath is
 * identical (a hashed, single-use, expiring token — see
 * src/server/auth/password-reset.ts): that copy is written for "you
 * asked to reset a password you already had," which reads oddly for
 * someone who has never logged in before. The link itself is the same
 * kind of link either way.
 */
export function staffWelcomeEmail(resetUrl: string): {
  subject: string;
  text: string;
} {
  return {
    subject: "Your SCIT Internship Portal account has been created",
    text: [
      "An account has been created for you on the SCIT Internship Portal.",
      "",
      "Use the link below to set your password and sign in. This link expires in 1 hour and can only be used once.",
      "",
      resetUrl,
      "",
      "If you weren't expecting this, contact the Internship Focal Person's office.",
    ].join("\n"),
  };
}
