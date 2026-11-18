import nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';

/** Attachment accepted by the email service. */
export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}

let transporter: Transporter | undefined;

/** Build (once) the SMTP transporter from the server environment. */
function mailer(): Transporter {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST ?? '';
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';
  if (host === '' || user === '' || pass === '') {
    throw new Error('Email is not configured: set SMTP_HOST, SMTP_USER and SMTP_PASS');
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

/** Sender shown in the inbox; defaults to the SMTP account. */
function from(): string {
  const configured = process.env.SMTP_FROM?.trim();
  if (configured !== undefined && configured !== '') return configured;
  return process.env.SMTP_USER ?? 'noreply@microbalance.ng';
}

/**
 * Send one plain-text email, optionally with attachments.
 * @param input - recipient(s), subject, body, and attachments.
 * @returns the SMTP message id.
 */
export async function sendEmail(input: SendEmailInput): Promise<string> {
  const message: SendMailOptions = {
    from: from(),
    to: Array.isArray(input.to) ? input.to.join(', ') : input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  };
  const info = await mailer().sendMail(message);
  return info.messageId;
}
