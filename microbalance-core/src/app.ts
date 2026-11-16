import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { fromNodeHeaders } from 'better-auth/node';
import { apiRoutes } from './routes/api.js';
import { authRoutes } from './routes/auth.js';
import { landingRoutes } from './routes/landing.js';
import { documentRoutes } from './routes/documents.js';
import { auditRoutes } from './routes/audit.js';
import { driveRoutes } from './routes/drive.js';
import { logAudit } from './lib/audit.js';
import { auth } from './lib/auth.js';
import { LedgerError } from './engine/errors.js';

const PROTECTED_PREFIXES = ['/api/ai-intent', '/api/journals', '/api/documents', '/api/audit', '/api/drive'];

/** Business actions mapped to audit records (entity type + verb). */
const AUDIT_ACTIONS: Record<string, { action: string; entityType: string }> = {
  CREATE_CUSTOMER: { action: 'CREATE', entityType: 'Customer' },
  CREATE_INVOICE: { action: 'CREATE', entityType: 'Invoice' },
  RECORD_INVOICE_PAYMENT: { action: 'UPDATE', entityType: 'Invoice' },
  CREATE_BILL: { action: 'CREATE', entityType: 'Bill' },
  RECORD_BILL_PAYMENT: { action: 'UPDATE', entityType: 'Bill' },
  CREATE_VENDOR: { action: 'CREATE', entityType: 'Vendor' },
  CREATE_ITEM: { action: 'CREATE', entityType: 'Item' },
  CREATE_EMPLOYEE: { action: 'CREATE', entityType: 'Employee' },
  RUN_PAYROLL: { action: 'CREATE', entityType: 'PayrollRun' },
  CREATE_EXPENSE: { action: 'CREATE', entityType: 'Expense' },
  APPROVE_EXPENSE: { action: 'APPROVE', entityType: 'Expense' },
  CREATE_EXPENSE_CATEGORY: { action: 'CREATE', entityType: 'ExpenseCategory' },
  CREATE_ASSET: { action: 'CREATE', entityType: 'FixedAsset' },
  RUN_DEPRECIATION: { action: 'UPDATE', entityType: 'FixedAsset' },
  DISPOSE_ASSET: { action: 'UPDATE', entityType: 'FixedAsset' },
  CREATE_BUDGET: { action: 'CREATE', entityType: 'Budget' },
  DELETE_BUDGET: { action: 'DELETE', entityType: 'Budget' },
  UPDATE_BUSINESS_PROFILE: { action: 'UPDATE', entityType: 'BusinessProfile' },
  PROPOSE_JOURNAL: { action: 'CREATE', entityType: 'Journal' },
  RECONCILE_TRANSACTION: { action: 'UPDATE', entityType: 'BankTransaction' },
  LOCK_PERIOD: { action: 'UPDATE', entityType: 'Journal' },
  UNLOCK_PERIOD: { action: 'UPDATE', entityType: 'Journal' },
};

const entityIdOf = (data: unknown): string => {
  if (data === null || typeof data !== 'object') return '';
  const envelope = data as Record<string, any>;
  const record = (envelope.data ?? envelope) as Record<string, any>;
  const id = record.id ?? record.invoice?.id ?? record.bill?.id ?? record.journal?.id ??
    record.expense?.id ?? record.budget?.id ?? record.documentId ?? record.entry?.id;
  if (id !== undefined && id !== null && id !== '') return String(id);
  if (record.month !== undefined && record.year !== undefined) {
    return `${String(record.year)}-${String(record.month).padStart(2, '0')}`;
  }
  return '';
};

const LEDGER_STATUS: Record<LedgerError['code'], number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  STATE: 409,
};

/**
 * Build the Fastify application: CORS, Better Auth, session guard, and the
 * tenant-scoped ERP intent router.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // The DSH Web UI is served from another port, so browser JSON POSTs need CORS
  // with credentials (the Better Auth session cookie).
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin !== undefined) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  // Every ERP intent needs a Google session with an active organization.
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (!PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      return reply.code(401).send({ error: 'Sign in required', code: 'UNAUTHORIZED' });
    }

    const companyId = session.session.activeOrganizationId;
    if (!companyId) {
      return reply
        .code(403)
        .send({ error: 'Create or select a business first', code: 'NO_ORGANIZATION' });
    }

    request.companyId = companyId;
    request.userId = session.user.id;
  });

  // Append an audit record for every successful write request.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method !== 'POST' || reply.statusCode >= 400) return payload;
    const companyId = request.companyId;
    if (!companyId) return payload;

    const path = request.url.split('?')[0] ?? '';
    const isIntent = path === '/api/ai-intent';
    const isApprove = /^\/api\/journals\/[^/]+\/approve$/.test(path);
    const isExtract = /^\/api\/documents\/[^/]+\/extract$/.test(path);
    if (!isIntent && !isApprove && !isExtract) return payload;

    let action = '';
    let entityType = '';
    let entityId = '';

    if (isIntent) {
      const body = request.body as { action?: string } | undefined;
      const mapped = AUDIT_ACTIONS[body?.action ?? ''];
      if (!mapped) return payload;
      action = mapped.action;
      entityType = mapped.entityType;
    } else if (isApprove) {
      const segments = path.split('/');
      action = 'APPROVE';
      entityType = 'Journal';
      entityId = segments[3] ?? '';
    } else {
      const segments = path.split('/');
      const body = request.body as { autoCreateBill?: boolean } | undefined;
      action = body?.autoCreateBill === true ? 'CREATE' : 'UPDATE';
      entityType = body?.autoCreateBill === true ? 'Bill' : 'Document';
      entityId = segments[3] ?? '';
    }

    try {
      const text = typeof payload === 'string'
        ? payload
        : Buffer.isBuffer(payload)
          ? payload.toString('utf8')
          : '';
      const data = text === '' ? null : JSON.parse(text);
      await logAudit(
        companyId,
        request.userId ?? 'system',
        action,
        entityType,
        entityId === '' ? entityIdOf(data) : entityId,
        null,
        data,
      );
    } catch {
      // Auditing is best-effort and must not fail the response.
    }

    return payload;
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

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  await app.register(landingRoutes);
  await app.register(authRoutes);
  await app.register(documentRoutes);
  await app.register(auditRoutes);
  await app.register(driveRoutes);
  await app.register(apiRoutes);

  return app;
}
