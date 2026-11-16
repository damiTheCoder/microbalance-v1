import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { companyPrisma } from '../lib/tenancy.js';
import { erpFor } from '../engine/ErpService.js';
import { LedgerError } from '../engine/errors.js';
import { parseReceipt, recogniseText } from '../lib/vision.js';

const EXTRACTIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
};

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).optional(),
  unitPrice: z.union([z.string(), z.number()]).optional(),
});

const extractedSchema = z.object({
  vendorName: z.string().min(1),
  date: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

const extractBody = z.object({
  extractedData: extractedSchema,
  autoCreateBill: z.boolean().optional(),
});

const paramsSchema = z.object({ id: z.string().min(1) });

const uploadQuery = z.object({
  source: z.enum(['OCR', 'MANUAL']).optional(),
});

const numberOr = (value: string | number | undefined, fallback = 0): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Document Centre API: upload, OCR, review, and bill creation. */
export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/documents/upload', async (request, reply) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');

    const query = uploadQuery.parse(request.query);
    const part = await request.file();
    if (!part) throw new LedgerError('VALIDATION', 'No file was uploaded');

    const id = randomUUID();
    const ext = EXTRACTIONS[part.mimetype] ?? (extname(part.filename ?? '').toLowerCase() || '.bin');
    const dir = join(process.cwd(), 'uploads', companyId);
    await mkdir(dir, { recursive: true });

    const absolute = join(dir, `${id}${ext}`);
    await pipeline(part.file, createWriteStream(absolute));

    const relative = join('uploads', companyId, `${id}${ext}`);
    const document = await companyPrisma(companyId).document.create({
      data: {
        id,
        companyId,
        filename: basename(absolute),
        originalName: part.filename ?? `upload${ext}`,
        mimeType: part.mimetype,
        filePath: relative,
        source: query.source ?? 'OCR',
      },
    });

    return reply.send({ documentId: document.id, filePath: document.filePath });
  });

  app.get('/api/documents', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const documents = await companyPrisma(companyId).document.findMany({
      orderBy: { uploadedAt: 'desc' },
    });
    return { data: documents };
  });

  app.post('/api/documents/:id/ocr', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const { id } = paramsSchema.parse(request.params);
    const db = companyPrisma(companyId);

    const document = await db.document.findUnique({ where: { id } });
    if (!document) throw new LedgerError('NOT_FOUND', `Document ${id} not found`);

    const absolute = isAbsolute(document.filePath)
      ? document.filePath
      : resolve(process.cwd(), document.filePath);

    try {
      const text = await recogniseText(absolute);
      const extractedData = parseReceipt(text);
      await db.document.update({
        where: { id },
        data: {
          status: 'PROCESSED',
          extractedData: extractedData as unknown as Prisma.InputJsonValue,
        },
      });
      return { documentId: id, extractedData, text };
    } catch (cause) {
      await db.document.update({ where: { id }, data: { status: 'FAILED' } });
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new LedgerError('VALIDATION', `Could not read document: ${message}`);
    }
  });

  app.post('/api/documents/:id/extract', async (request) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const { id } = paramsSchema.parse(request.params);
    const input = extractBody.parse(request.body);
    const db = companyPrisma(companyId);

    const document = await db.document.findUnique({ where: { id } });
    if (!document) throw new LedgerError('NOT_FOUND', `Document ${id} not found`);

    const extractedData = input.extractedData;
    await db.document.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        extractedData: extractedData as unknown as Prisma.InputJsonValue,
      },
    });

    if (!input.autoCreateBill) {
      return { documentId: id, extractedData, bill: null };
    }

    const erp = erpFor(companyId);
    const vendorName = extractedData.vendorName.trim();
    const vendor =
      (await db.vendor.findFirst({ where: { name: vendorName } })) ??
      (await erp.createVendor({ name: vendorName }));

    const items = (extractedData.lineItems ?? [])
      .map((line) => ({
        description: line.description,
        quantity: numberOr(line.quantity, 1) || 1,
        unitCost: numberOr(line.unitPrice, 0),
      }))
      .filter((line) => line.unitCost > 0);

    if (items.length === 0) {
      const amount = numberOr(extractedData.amount, 0);
      if (amount <= 0) throw new LedgerError('VALIDATION', 'Document has no amount to bill');
      items.push({
        description: `Receipt ${document.originalName}`,
        quantity: 1,
        unitCost: amount,
      });
    }

    const date = extractedData.date !== undefined && extractedData.date !== ''
      ? extractedData.date
      : new Date().toISOString().slice(0, 10);

    const result = await erp.createBill({ vendorId: vendor.id, date, items });
    return { documentId: id, extractedData, bill: result.bill, journal: result.journal };
  });
}
