import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendEmail } from '../lib/mailer.js';
import type { EmailAttachment } from '../lib/mailer.js';
import { generatePdfReport } from '../lib/reports.js';
import type { ReportType } from '../lib/reports.js';
import { LedgerError } from '../engine/errors.js';

const reportTypeSchema = z.enum(['PROFIT_AND_LOSS', 'BALANCE_SHEET', 'TRIAL_BALANCE']);

const sendBody = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().max(20_000).optional(),
  reportType: reportTypeSchema.optional(),
});

const FILE_NAMES: Record<ReportType, string> = {
  PROFIT_AND_LOSS: 'profit-and-loss.pdf',
  BALANCE_SHEET: 'balance-sheet.pdf',
  TRIAL_BALANCE: 'trial-balance.pdf',
};

/** Outbound email: plain messages and financial-report attachments. */
export async function emailRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/email/send', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');

    const parsed = sendBody.safeParse(request.body);
    if (!parsed.success) {
      throw new LedgerError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid email');
    }
    const { to, subject, reportType } = parsed.data;
    const text = parsed.data.text ?? '';

    const attachments: EmailAttachment[] = [];
    if (reportType !== undefined) {
      const pdf = await generatePdfReport(companyId, reportType);
      attachments.push({
        filename: FILE_NAMES[reportType],
        content: pdf,
        contentType: 'application/pdf',
      });
    }

    const messageId = await sendEmail({ to, subject, text, attachments });
    return { sent: true, to, messageId };
  });
}
