import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { companyPrisma } from '../lib/tenancy.js';
import { LedgerError } from '../engine/errors.js';
import {
  disconnectGmail,
  exchangeGmailCode,
  encryptToken,
  getGmailAuthUrl,
  gmailStatus,
  readState,
} from '../lib/gmail.js';

const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

/** Gmail send permission: connect, callback, and connection status. */
export async function gmailAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/email/connect', async (request, reply) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    return reply.redirect(getGmailAuthUrl(companyId), 302);
  });

  app.get('/api/email/callback', async (request, reply) => {
    const query = callbackQuery.parse(request.query);
    const page = (title: string, body: string): string =>
      `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      '<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;' +
      'justify-content:center;height:100vh;margin:0;background:#fafafa;color:#111}' +
      'main{max-width:420px;text-align:center;padding:28px;border:1px solid #e5e7eb;' +
      'border-radius:20px;background:#fff}h1{font-size:20px;margin:0 0 8px}' +
      'p{color:#6b7280;font-size:14px;line-height:1.5;margin:0}</style>' +
      `<main><h1>${title}</h1><p>${body}</p></main>` +
      '<script>setTimeout(()=>{window.close()},1500)</script>';

    if (query.error !== undefined) {
      return reply.type('text/html').send(page('Gmail connection cancelled', 'No changes were saved.'));
    }
    if (query.code === undefined || query.state === undefined) {
      return reply.code(400).type('text/html').send(page('Invalid callback', 'Missing Google parameters.'));
    }
    const companyId = readState(query.state);
    if (companyId === null) {
      return reply.code(400).type('text/html').send(page('Invalid state', 'Please start the connection again.'));
    }

    try {
      const tokens = await exchangeGmailCode(query.code);
      if (tokens === null) {
        return reply.type('text/html').send(
          page(
            'Gmail not connected',
            'Google did not return a refresh token. Remove MicroBalance from your Google account permissions and try again.',
          ),
        );
      }
      await companyPrisma(companyId).businessProfile.updateMany({
        where: { companyId },
        data: { gmailRefreshToken: encryptToken(tokens.refreshToken), gmailEmail: tokens.email },
      });
      return reply
        .type('text/html')
        .send(page('✅ Gmail Connected', `Signed in as ${tokens.email}. You can close this tab.`));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return reply.code(400).type('text/html').send(page('Could not connect Gmail', message));
    }
  });

  app.get('/api/email/status', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    return gmailStatus(companyId);
  });

  app.post('/api/email/disconnect', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    await disconnectGmail(companyId);
    return { connected: false, email: '' };
  });
}
