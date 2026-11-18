/** Authenticated downloads for the LIRS/NRS statutory schedules. */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LedgerError } from '../engine/errors.js';
import {
  generateLirsPayeSchedule,
  generateVatSchedule,
  generateWhtSchedule,
} from '../lib/tax-schedules.js';

const periodQuery = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Serve a generated schedule as an attachment with its original filename. */
async function sendSchedule(
  reply: FastifyReply,
  filePath: string,
  contentType: string,
): Promise<void> {
  const file = await readFile(filePath);
  await reply
    .header('Content-Type', contentType)
    .header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`)
    .send(file);
}

export async function taxDownloadRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tax/paye-schedule', async (request, reply) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const { month, year } = periodQuery.parse(request.query);
    const filePath = await generateLirsPayeSchedule(companyId, month, year);
    await sendSchedule(reply, filePath, XLSX_MIME);
  });

  app.get('/api/tax/vat-schedule', async (request, reply) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const { month, year } = periodQuery.parse(request.query);
    const filePath = await generateVatSchedule(companyId, month, year);
    await sendSchedule(reply, filePath, 'text/csv; charset=utf-8');
  });

  app.get('/api/tax/wht-schedule', async (request, reply) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const { month, year } = periodQuery.parse(request.query);
    const filePath = await generateWhtSchedule(companyId, month, year);
    await sendSchedule(reply, filePath, XLSX_MIME);
  });
}
