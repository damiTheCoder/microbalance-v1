import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { companyPrisma } from '../lib/tenancy.js';
import { LedgerError } from '../engine/errors.js';

const stateBody = z.object({
  integration: z.enum(['drive', 'gmail']),
  enabled: z.boolean(),
});

/** Integration switches: whether Drive backups and Gmail sending may run. */
export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/integrations/state', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const profile = await companyPrisma(companyId).businessProfile.findFirst();
    return {
      drive: profile?.driveEnabled ?? true,
      gmail: profile?.gmailEnabled ?? true,
    };
  });

  app.post('/api/integrations/state', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const input = stateBody.parse(request.body);
    const profile = await companyPrisma(companyId).businessProfile.findFirst();
    if (!profile) throw new LedgerError('NOT_FOUND', 'Save your business profile first');
    await companyPrisma(companyId).businessProfile.update({
      where: { id: profile.id },
      data: input.integration === 'drive'
        ? { driveEnabled: input.enabled }
        : { gmailEnabled: input.enabled },
    });
    return { drive: input.integration === 'drive' ? input.enabled : profile.driveEnabled,
      gmail: input.integration === 'gmail' ? input.enabled : profile.gmailEnabled };
  });
}
