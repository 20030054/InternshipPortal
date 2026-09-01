/**
 * OQ-05, answered (D-122): the mechanism this codebase already uses
 * for staff accounts (`staff-welcome-email.ts`) sends a set-your-own-
 * password link, never a plaintext password — deliberately safer, and
 * the pattern this file would follow by default. The user's answer
 * for students asks for something different and more direct: a real
 * generated password, visible on an Admin-reviewed sheet, sent as-is
 * so a student can log in immediately without an extra step. Honoring
 * that literally (not silently substituting the safer staff-style
 * flow) — but the email still tells the student to change it, and the
 * portal's own `/forgot-password` remains available the moment they
 * want to.
 */
export function studentCredentialsEmail(
  email: string,
  password: string,
  loginUrl: string,
): { subject: string; text: string } {
  return {
    subject: "Your SCIT Internship Portal login",
    text: [
      "An account has been created for you on the SCIT Internship Portal.",
      "",
      `Email: ${email}`,
      `Password: ${password}`,
      "",
      `Sign in here: ${loginUrl}`,
      "",
      "Please change this password after your first sign-in — use \"Forgot password?\" on the sign-in page to set a new one.",
      "",
      "If you weren't expecting this, contact the Internship Focal Person's office.",
    ].join("\n"),
  };
}
