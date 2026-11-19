/** AI token usage for the signed-in company (month-to-date). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LedgerError } from '../engine/errors.js';
import { monthlyUsage, recordUsage } from '../lib/usage.js';

const usageBody = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().optional(),
});

/** Read the monthly aggregate, and record usage reported by the chat runtime. */
export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/usage/tokens', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    return { data: monthlyUsage(companyId) };
  });

  app.post('/api/usage/tokens', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const body = usageBody.parse(request.body);
    recordUsage(companyId, {
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      cachedTokens: body.cachedTokens ?? 0,
    });
    return { data: monthlyUsage(companyId) };
  });
}
