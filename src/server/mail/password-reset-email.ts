/**
 * The one email M02 sends. Not part of M12's templated/versioned
 * notification system (that system doesn't exist yet) — a single
 * dedicated function is the right amount of structure for one email.
 */
export function passwordResetEmail(resetUrl: string): {
  subject: string;
  text: string;
} {
  return {
    subject: "Reset your SCIT Internship Portal password",
    text: [
      "A password reset was requested for your account on the SCIT Internship Portal.",
      "",
      "If this was you, use the link below to choose a new password. This link expires in 1 hour and can only be used once.",
      "",
      resetUrl,
      "",
      "If you did not request this, you can safely ignore this email — your password will not be changed.",
    ].join("\n"),
  };
}
