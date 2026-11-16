import type { FastifyInstance } from 'fastify';
import { auth } from '../lib/auth.js';

const SKIP_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection']);

/**
 * Better Auth handler. Fastify has already parsed the JSON body, so it is
 * re-serialized into a Web `Request` and the Web `Response` is copied back.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.all('/api/auth/*', async (request, reply) => {
      const url = new URL(
        request.url,
        `http://${request.headers.host ?? 'localhost:3001'}`,
      );

      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        headers.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }

      const init: RequestInit = { method: request.method, headers };
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined) {
        init.body =
          typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      }

      const response = await auth.handler(new Request(url, init));

      reply.code(response.status);
      for (const [key, value] of response.headers) {
        if (SKIP_HEADERS.has(key.toLowerCase())) continue;
        if (key.toLowerCase() === 'set-cookie') continue;
        reply.header(key, value);
      }

      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);

    return reply.send(Buffer.from(await response.arrayBuffer()));
  });
}
