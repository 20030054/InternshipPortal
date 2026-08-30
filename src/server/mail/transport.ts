import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!host) {
      throw new Error("SMTP_HOST is not set.");
    }
    transporter = nodemailer.createTransport({
      host,
      port,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Sends via the BNU SMTP relay only — MASTER_PROMPT.md §6.1: "No
 * third-party mail service holding student data." M12 replaces this
 * single function with the full templated/versioned notification system;
 * M02 needs exactly one email (password reset) and shouldn't build that
 * system early just to send it.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const from = process.env.MAIL_FROM;
  if (!from) {
    throw new Error("MAIL_FROM is not set.");
  }
  await getTransporter().sendMail({ from, ...message });
}
