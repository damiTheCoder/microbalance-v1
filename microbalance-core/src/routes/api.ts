import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LedgerError } from '../engine/errors.js';
import { ledgerEngine } from '../engine/LedgerEngine.js';
import { erpService } from '../engine/ErpService.js';

const decimalish = z.union([z.string().min(1), z.number()]);

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a valid date');

const journalLineSchema = z.object({
  accountId: z.string().min(1),
  debit: decimalish.optional(),
  credit: decimalish.optional(),
});

const proposeJournalSchema = z.object({
  date: isoDate.optional(),
  memo: z.string().optional(),
  lines: z.array(journalLineSchema),
});

const createInvoiceSchema = z.object({
  customerId: z.string().min(1),
  date: isoDate,
  dueDate: isoDate.optional(),
  items: z.array(
    z.object({
      itemId: z.string().min(1).optional(),
      description: z.string().optional(),
      quantity: decimalish,
      unitPrice: decimalish.optional(),
    }),
  ),
});

const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: decimalish,
  bankAccountId: z.string().min(1),
  date: isoDate.optional(),
});

const createBillSchema = z.object({
  vendorId: z.string().min(1),
  date: isoDate,
  dueDate: isoDate.optional(),
  items: z.array(
    z.object({
      description: z.string().min(1),
      quantity: decimalish,
      unitCost: decimalish,
    }),
  ),
});

const reconcileSchema = z.object({
  transactionId: z.string().min(1),
  matchedId: z.string().min(1),
  matchedType: z.enum(['INVOICE', 'BILL']),
});

const rangeSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const balanceSheetSchema = z.object({
  asOf: isoDate.optional(),
});

const generalLedgerSchema = z.object({
  accountId: z.string().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.enum(['PENDING', 'POSTED']).optional(),
});

const agingSchema = z.object({
  asOf: isoDate.optional(),
});

const intentSchema = z.object({
  action: z.string().min(1),
  payload: z.unknown().optional(),
});

function asObject(payload: unknown): Record<string, unknown> {
  if (payload === undefined || payload === null) return {};
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new LedgerError('VALIDATION', 'payload must be an object');
  }
  return payload as Record<string, unknown>;
}

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'microbalance-core',
    timestamp: new Date().toISOString(),
  }));

  app.post('/api/ai-intent', async (request) => {
    const body = intentSchema.parse(request.body);
    const payload = asObject(body.payload);

    switch (body.action) {
      case 'GET_TRIAL_BALANCE':
        // Rows carry the IFRS `code`, `category`, and `isSystem` fields.
        return { action: body.action, data: await ledgerEngine.getTrialBalance() };

      case 'PROPOSE_JOURNAL': {
        const input = proposeJournalSchema.parse(payload);
        return {
          action: body.action,
          data: await ledgerEngine.proposeJournal({
            date: input.date,
            memo: input.memo,
            lines: input.lines,
          }),
        };
      }

      case 'CREATE_INVOICE': {
        const input = createInvoiceSchema.parse(payload);
        return { action: body.action, data: await erpService.createInvoice(input) };
      }

      case 'RECORD_INVOICE_PAYMENT': {
        const input = recordPaymentSchema.parse(payload);
        return {
          action: body.action,
          data: await erpService.recordInvoicePayment(
            input.invoiceId,
            input.amount,
            input.bankAccountId,
            input.date,
          ),
        };
      }

      case 'CREATE_BILL': {
        const input = createBillSchema.parse(payload);
        return { action: body.action, data: await erpService.createBill(input) };
      }

      case 'GET_AR_AGING': {
        const input = agingSchema.parse(payload);
        return { action: body.action, data: await erpService.getArAging(input.asOf) };
      }

      case 'GET_AP_AGING': {
        const input = agingSchema.parse(payload);
        return { action: body.action, data: await erpService.getApAging(input.asOf) };
      }

      case 'GET_UNRECONCILED_TRANSACTIONS':
        return {
          action: body.action,
          data: await erpService.getUnreconciledTransactions(),
        };

      case 'RECONCILE_TRANSACTION': {
        const input = reconcileSchema.parse(payload);
        return {
          action: body.action,
          data: await erpService.reconcileBankTransaction(
            input.transactionId,
            input.matchedId,
            input.matchedType,
          ),
        };
      }

      case 'GET_PROFIT_AND_LOSS': {
        const input = rangeSchema.parse(payload);
        return {
          action: body.action,
          data: await ledgerEngine.getProfitAndLoss({ from: input.from, to: input.to }),
        };
      }

      case 'GET_BALANCE_SHEET': {
        const input = balanceSheetSchema.parse(payload);
        return {
          action: body.action,
          data: await ledgerEngine.getBalanceSheet(input.asOf),
        };
      }

      case 'GET_GENERAL_LEDGER': {
        const input = generalLedgerSchema.parse(payload);
        return {
          action: body.action,
          data: await ledgerEngine.getGeneralLedger(input),
        };
      }

      default:
        throw new LedgerError('VALIDATION', `Unsupported action: ${body.action}`);
    }
  });

  app.post('/api/journals/:id/approve', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const entry = await ledgerEngine.postJournal(params.id);
    return { data: entry };
  });
}
