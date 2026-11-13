import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { truncate } from './core/client.js';
import { chatRoutes } from './routes/chat.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? 'invalid request';
      return reply.code(400).send({ error: truncate(message) });
    }

    const err = error as { statusCode?: number; message?: string };
    const status =
      typeof err.statusCode === 'number' && err.statusCode >= 400
        ? err.statusCode
        : 500;
    const message = err.message ?? 'internal error';
    request.log.error({ err: message }, 'request failed');
    return reply.code(status).send({ error: truncate(message) });
  });

  app.register(chatRoutes);

  return app;
}
