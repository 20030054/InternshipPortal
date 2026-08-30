/**
 * Same un-templated, one-off shape as `password-reset-email.ts` (M02) —
 * M12's "email templates... versioned" system doesn't exist yet, and
 * this module isn't the one that should invent it. See
 * docs/modules/M08.md "Scope decisions."
 */
export function supervisorTokenEmail(evaluationUrl: string): {
  subject: string;
  text: string;
} {
  return {
    subject: "Internship evaluation request — SCIT Internship Portal",
    text: [
      "You are listed as the workplace supervisor for a student completing an internship placement under the SCIT Internship Portal at Beaconhouse National University.",
      "",
      "Please use the link below to complete a short evaluation of the student's internship. The link can only be used once and expires after a limited time.",
      "",
      evaluationUrl,
      "",
      "The form asks only a brief performance rating and comments — it takes a few minutes. No account or login is required.",
      "",
      "If you believe you received this message in error, you can safely ignore it.",
    ].join("\n"),
  };
}
