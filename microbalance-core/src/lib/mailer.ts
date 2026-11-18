import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { gmailFor } from './gmail.js';

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

/** Thrown when the company has not connected a Google account yet. */
export class GmailNotConnectedError extends Error {
  constructor() {
    super('Please connect your Google Account in Settings first to enable email sending.');
    this.name = 'GmailNotConnectedError';
  }
}

/** Thrown when Google rejects the stored refresh token. */
export class GmailAuthError extends Error {
  constructor() {
    super('Gmail access expired. Please reconnect your Google Account in Settings.');
    this.name = 'GmailAuthError';
  }
}

/** Undo HTML entities the model sometimes passes through (`&amp;`, `&#39;`). */
function plain(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/** Render the message as RFC 5322 bytes with nodemailer's stream transport. */
async function mime(message: SendMailOptions): Promise<Buffer> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });
  const info = (await transport.sendMail(message)) as unknown as { message: Buffer };
  return info.message;
}

/**
 * Send one plain-text email as the connected Gmail account.
 * @param companyId - tenant whose stored refresh token is used.
 * @param input - recipient(s), subject, body, and attachments.
 * @returns the Gmail message id.
 */
export async function sendEmail(companyId: string, input: SendEmailInput): Promise<string> {
  const connection = await gmailFor(companyId);
  if (connection === null) throw new GmailNotConnectedError();

  const raw = await mime({
    from: connection.email === '' ? undefined : `MicroBalance <${connection.email}>`,
    to: Array.isArray(input.to) ? input.to.join(', ') : input.to,
    subject: plain(input.subject),
    text: plain(input.text),
    attachments: input.attachments,
  });

  try {
    const sent = await connection.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: raw.toString('base64url') },
    });
    return sent.data.id ?? '';
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause);
    if (/invalid_grant|invalid_request|unauthorized|401/i.test(text)) throw new GmailAuthError();
    throw cause;
  }
}
