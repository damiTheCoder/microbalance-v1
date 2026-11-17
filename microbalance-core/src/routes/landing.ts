import { readFileSync } from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth.js';

/** The landing page ships as one self-contained document (no extra requests). */
const PAGE = readFileSync(new URL('../landing/index.html', import.meta.url), 'utf8');

/** Where the authenticated app lives (DSH Web on the same host, port 3080). */
function appUrl(request: FastifyRequest): string {
  const configured = process.env.APP_URL;
  if (configured !== undefined && configured !== '') return configured;
  const protocol = request.protocol === 'https' ? 'https' : 'http';
  return `${protocol}://${request.hostname}:3080/`;
}

/**
 * Public landing page. Signed-in visitors skip it and land in the app unless
 * they explicitly asked for the landing page (`/?home=1`, used by the sidebar
 * brand link so "go home" never bounces straight back into the app).
 */
export async function landingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request, reply) => {
    const stay = (request.query as { home?: string } | undefined)?.home === '1';
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (session !== null && session !== undefined && !stay) {
      return reply.redirect(appUrl(request), 302);
    }

    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(PAGE);
  });
}
