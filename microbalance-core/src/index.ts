import 'dotenv/config';
import Fastify from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { apiRoutes } from './routes/api.js';
import { LedgerError } from './engine/errors.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

const LEDGER_STATUS: Record<LedgerError['code'], number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  STATE: 409,
};

// The DSH Web UI is served from a different origin (usually :3080), so the
// browser's JSON POSTs need CORS headers and an OPTIONS preflight answer.
app.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    return reply.code(204).send();
  }
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof LedgerError) {
    return reply.status(LEDGER_STATUS[error.code]).send({
      error: error.message,
      code: error.code,
    });
  }

  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'payload';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    return reply.status(400).send({ error: message, code: 'VALIDATION' });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return reply.status(404).send({ error: 'Record not found', code: 'NOT_FOUND' });
    }
    if (error.code === 'P2002') {
      return reply
        .status(400)
        .send({ error: 'Unique constraint violation', code: 'VALIDATION' });
    }
    if (error.code === 'P2003') {
      return reply
        .status(400)
        .send({ error: 'Referenced record does not exist', code: 'VALIDATION' });
    }
  }

  const statusCode = (error as { statusCode?: number }).statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    const message = error instanceof Error ? error.message : String(error);
    return reply.status(statusCode).send({ error: message, code: 'VALIDATION' });
  }

  request.log.error(error);
  return reply.status(500).send({ error: 'Internal server error', code: 'INTERNAL' });
});

await app.register(apiRoutes);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  });
}
