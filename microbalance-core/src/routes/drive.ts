import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { companyPrisma } from '../lib/tenancy.js';
import { LedgerError } from '../engine/errors.js';
import { exchangeCode, getDriveAuthUrl, readState, syncCompanyReports } from '../lib/drive.js';

const SCHEDULES = ['MANUAL', 'WEEKLY', 'MONTHLY'] as const;

const scheduleSchema = z.object({ schedule: z.enum(SCHEDULES) });

const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

/** Google Drive backup: connect, callback, schedule, and manual sync. */
export async function driveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/drive/connect', async (request, reply) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    return reply.redirect(getDriveAuthUrl(companyId), 302);
  });

  app.get('/api/drive/callback', async (request, reply) => {
    const query = callbackQuery.parse(request.query);
    const page = (title: string, body: string): string =>
      `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      '<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;' +
      'justify-content:center;height:100vh;margin:0;background:#fafafa;color:#111}' +
      'main{max-width:420px;text-align:center;padding:28px;border:1px solid #e5e7eb;' +
      'border-radius:20px;background:#fff}h1{font-size:20px;margin:0 0 8px}' +
      'p{color:#6b7280;font-size:14px;line-height:1.5;margin:0}</style>' +
      `<main><h1>${title}</h1><p>${body}</p></main>`;

    if (query.error !== undefined) {
      return reply.type('text/html').send(page('Drive connection cancelled', 'No changes were saved.'));
    }
    if (query.code === undefined || query.state === undefined) {
      return reply.code(400).type('text/html').send(page('Invalid callback', 'Missing Google parameters.'));
    }

    const companyId = readState(query.state);
    if (companyId === null) {
      return reply.code(400).type('text/html').send(page('Invalid state', 'Please start the connection again.'));
    }

    try {
      const refreshToken = await exchangeCode(query.code);
      if (refreshToken === null) {
        return reply.type('text/html').send(
          page('Drive not connected', 'Google did not return a refresh token. Remove MicroBalance from your Google account permissions and try again.'),
        );
      }
      await companyPrisma(companyId).businessProfile.updateMany({
        where: { companyId },
        data: { driveConnected: true, driveRefreshToken: refreshToken },
      });
      return reply.type('text/html').send(
        page('Google Drive connected', 'MicroBalance can now back up reports to your Drive. You can close this tab.'),
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return reply.code(400).type('text/html').send(page('Could not connect Drive', message));
    }
  });

  app.post('/api/drive/sync', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    try {
      const profile = await companyPrisma(companyId).businessProfile.findFirst();
      if (profile?.driveEnabled === false) {
        throw new LedgerError('STATE', 'Google Drive is turned off in Integrations.');
      }
      const result = await syncCompanyReports(companyId);
      return { data: result };
    } catch (cause) {
      throw new LedgerError('VALIDATION', cause instanceof Error ? cause.message : String(cause));
    }
  });

  app.post('/api/drive/schedule', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const input = scheduleSchema.parse(request.body);

    const profile = await companyPrisma(companyId).businessProfile.findFirst();
    if (!profile) throw new LedgerError('NOT_FOUND', 'Save your business profile first');
    await companyPrisma(companyId).businessProfile.update({
      where: { id: profile.id },
      data: { driveSyncSchedule: input.schedule },
    });
    return { data: { schedule: input.schedule } };
  });
}
