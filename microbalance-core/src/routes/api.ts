import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LedgerError } from '../engine/errors.js';
import { ledgerFor } from '../engine/LedgerEngine.js';
import { erpFor } from '../engine/ErpService.js';
import { DEFAULT_COMPANY_ID, companyPrisma } from '../lib/tenancy.js';

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

const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
});

const createVendorSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
});

const createItemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  price: decimalish,
  cost: decimalish.optional(),
  stockQuantity: z.coerce.number().int().nonnegative().optional(),
});

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  basicSalary: decimalish,
  housingAllowance: decimalish.optional(),
  transportAllowance: decimalish.optional(),
  isActive: z.boolean().optional(),
});

const runPayrollSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const createExpenseCategorySchema = z.object({
  name: z.string().min(1),
});

const createExpenseSchema = z.object({
  date: isoDate,
  description: z.string().min(1),
  amount: decimalish,
  categoryId: z.string().min(1),
  employeeId: z.string().min(1).optional(),
  paymentMethod: z.enum(['CASH', 'BANK', 'REIMBURSEMENT']),
});

const approveExpenseSchema = z.object({
  expenseId: z.string().min(1),
});

const createAssetSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  purchaseDate: isoDate,
  cost: decimalish,
  usefulLifeYears: z.coerce.number().int().min(1),
  salvageValue: decimalish.optional(),
});

const runDepreciationSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const disposeAssetSchema = z.object({
  assetId: z.string().min(1),
  disposalDate: isoDate,
  proceeds: decimalish.optional(),
});

const createBudgetSchema = z.object({
  name: z.string().min(1),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  lines: z.array(
    z.object({
      accountId: z.string().min(1),
      amount: decimalish,
      period: z.enum(['MONTHLY', 'ANNUAL']).optional(),
    }),
  ).min(1),
});

const budgetIdSchema = z.object({
  budgetId: z.string().min(1),
});

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
  action: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
});

const periodSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const updateBusinessProfileSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  logoUrl: z.string().optional(),
  currency: z.enum(['NGN', 'USD', 'GBP']).optional(),
  fiscalYearStart: z.string().optional(),
  vatRate: decimalish.optional(),
  whtRateCompany: decimalish.optional(),
  whtRateIndividual: decimalish.optional(),
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
  whtRate: z.coerce.number().min(0).max(100).optional(),
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

const recordBillPaymentSchema = z.object({
  billId: z.string().min(1),
  amount: decimalish,
  bankAccountId: z.string().min(1),
  date: isoDate.optional(),
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
    const companyId = request.companyId ?? DEFAULT_COMPANY_ID;
    const erp = erpFor(companyId);
    const ledger = ledgerFor(companyId);

    switch (body.action) {
      case 'GET_TRIAL_BALANCE':
        // Rows carry the IFRS `code`, `category`, and `isSystem` fields.
        return { action: body.action, data: await ledger.getTrialBalance() };

      case 'PROPOSE_JOURNAL': {
        const input = proposeJournalSchema.parse(payload);
        return {
          action: body.action,
          data: await ledger.proposeJournal({
            date: input.date,
            memo: input.memo,
            lines: input.lines,
          }),
        };
      }

      case 'GET_CUSTOMERS':
        return { action: body.action, data: await erp.getCustomers() };

      case 'GET_INVOICES':
        return { action: body.action, data: await erp.getInvoices() };

      case 'GET_VENDORS':
        return { action: body.action, data: await erp.getVendors() };

      case 'CREATE_VENDOR': {
        const input = createVendorSchema.parse(payload);
        return { action: body.action, data: await erp.createVendor(input) };
      }

      case 'GET_BILLS':
        return { action: body.action, data: await erp.getBills() };

      case 'GET_ITEMS':
        return { action: body.action, data: await erp.getItems() };

      case 'CREATE_ITEM': {
        const input = createItemSchema.parse(payload);
        return { action: body.action, data: await erp.createItem(input) };
      }

      case 'GET_PENDING_JOURNALS':
        return { action: body.action, data: await erp.getPendingJournals() };

      case 'GET_BANK_ACCOUNTS':
        return { action: body.action, data: await erp.getBankAccounts() };

      case 'CREATE_CUSTOMER': {
        const input = createCustomerSchema.parse(payload);
        return { action: body.action, data: await erp.createCustomer(input) };
      }

      case 'CREATE_INVOICE': {
        const input = createInvoiceSchema.parse(payload);
        return { action: body.action, data: await erp.createInvoice(input) };
      }

      case 'RECORD_INVOICE_PAYMENT': {
        const input = recordPaymentSchema.parse(payload);
        return {
          action: body.action,
          data: await erp.recordInvoicePayment(
            input.invoiceId,
            input.amount,
            input.bankAccountId,
            input.date,
          ),
        };
      }

      case 'CREATE_BILL': {
        const input = createBillSchema.parse(payload);
        return { action: body.action, data: await erp.createBill(input) };
      }

      case 'RECORD_BILL_PAYMENT': {
        const input = recordBillPaymentSchema.parse(payload);
        return {
          action: body.action,
          data: await erp.recordBillPayment(
            input.billId,
            input.amount,
            input.bankAccountId,
            input.date,
          ),
        };
      }

      case 'GET_WHT_SUMMARY':
        return { action: body.action, data: await erp.getWhtSummary() };

      case 'GET_AR_AGING': {
        const input = agingSchema.parse(payload);
        return { action: body.action, data: await erp.getArAging(input.asOf) };
      }

      case 'GET_AP_AGING': {
        const input = agingSchema.parse(payload);
        return { action: body.action, data: await erp.getApAging(input.asOf) };
      }

      case 'GET_TAX_SUMMARY':
        return { action: body.action, data: await erp.getTaxSummary() };

      case 'GET_EMPLOYEES':
        return { action: body.action, data: await erp.getEmployees() };

      case 'CREATE_EMPLOYEE': {
        const input = createEmployeeSchema.parse(payload);
        return { action: body.action, data: await erp.createEmployee(input) };
      }

      case 'RUN_PAYROLL': {
        const input = runPayrollSchema.parse(payload);
        return { action: body.action, data: await erp.runPayroll(input.month, input.year) };
      }

      case 'GET_PAYROLL_HISTORY':
        return { action: body.action, data: await erp.getPayrollHistory() };

      case 'GET_EXPENSE_CATEGORIES':
        return { action: body.action, data: await erp.getExpenseCategories() };

      case 'CREATE_EXPENSE_CATEGORY': {
        const input = createExpenseCategorySchema.parse(payload);
        return { action: body.action, data: await erp.createExpenseCategory(input) };
      }

      case 'GET_EXPENSES':
        return { action: body.action, data: await erp.getExpenses() };

      case 'CREATE_EXPENSE': {
        const input = createExpenseSchema.parse(payload);
        return { action: body.action, data: await erp.createExpense(input) };
      }

      case 'APPROVE_EXPENSE': {
        const input = approveExpenseSchema.parse(payload);
        return { action: body.action, data: await erp.approveExpense(input.expenseId) };
      }

      case 'GET_ASSETS':
        return { action: body.action, data: await erp.getAssets() };

      case 'CREATE_ASSET': {
        const input = createAssetSchema.parse(payload);
        return { action: body.action, data: await erp.createAsset(input) };
      }

      case 'RUN_DEPRECIATION': {
        const input = runDepreciationSchema.parse(payload);
        return {
          action: body.action,
          data: await erp.runDepreciation(input.month, input.year),
        };
      }

      case 'DISPOSE_ASSET': {
        const input = disposeAssetSchema.parse(payload);
        return {
          action: body.action,
          data: await erp.disposeAsset(input.assetId, input.disposalDate, input.proceeds),
        };
      }

      case 'CREATE_BUDGET': {
        const input = createBudgetSchema.parse(payload);
        return { action: body.action, data: await erp.createBudget(input) };
      }

      case 'GET_BUDGETS':
        return { action: body.action, data: await erp.getBudgets() };

      case 'GET_BUDGET_VS_ACTUAL': {
        const input = budgetIdSchema.parse(payload);
        return {
          action: body.action,
          data: await erp.getBudgetVsActual(input.budgetId),
        };
      }

      case 'DELETE_BUDGET': {
        const input = budgetIdSchema.parse(payload);
        return { action: body.action, data: await erp.deleteBudget(input.budgetId) };
      }

      case 'GET_AUDIT_LOG': {
        const input = auditQuerySchema.parse(payload);
        const db = companyPrisma(companyId);
        const where: { action?: string; entityType?: string } = {};
        if (input.action !== undefined) where.action = input.action;
        if (input.entityType !== undefined) where.entityType = input.entityType;

        const [items, total] = await Promise.all([
          db.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (input.page - 1) * input.pageSize,
            take: input.pageSize,
          }),
          db.auditLog.count({ where }),
        ]);

        return {
          action: body.action,
          data: { items, total, page: input.page, pageSize: input.pageSize },
        };
      }

      case 'LOCK_PERIOD': {
        const input = periodSchema.parse(payload);
        const db = companyPrisma(companyId);
        const start = new Date(input.year, input.month - 1, 1);
        const end = new Date(input.year, input.month, 0, 23, 59, 59, 999);
        const result = await db.journalEntry.updateMany({
          where: { date: { gte: start, lte: end }, isLocked: false },
          data: { isLocked: true, lockedAt: new Date() },
        });
        return {
          action: body.action,
          data: { month: input.month, year: input.year, locked: result.count },
        };
      }

      case 'UNLOCK_PERIOD': {
        const input = periodSchema.parse(payload);
        const db = companyPrisma(companyId);
        const start = new Date(input.year, input.month - 1, 1);
        const end = new Date(input.year, input.month, 0, 23, 59, 59, 999);
        const result = await db.journalEntry.updateMany({
          where: { date: { gte: start, lte: end }, isLocked: true },
          data: { isLocked: false, lockedAt: null },
        });
        return {
          action: body.action,
          data: { month: input.month, year: input.year, unlocked: result.count },
        };
      }

      case 'GET_LOCKED_PERIODS': {
        const db = companyPrisma(companyId);
        const locked = await db.journalEntry.findMany({
          where: { isLocked: true },
          select: { date: true, lockedAt: true },
        });
        const periods = new Map<string, { month: number; year: number; count: number; lockedAt: string }>();
        for (const journal of locked) {
          const key = `${journal.date.getFullYear()}-${journal.date.getMonth() + 1}`;
          const entry = periods.get(key);
          if (entry) {
            entry.count += 1;
          } else {
            periods.set(key, {
              month: journal.date.getMonth() + 1,
              year: journal.date.getFullYear(),
              count: 1,
              lockedAt: (journal.lockedAt ?? journal.date).toISOString(),
            });
          }
        }
        return {
          action: body.action,
          data: [...periods.values()].sort((a, b) =>
            a.year === b.year ? b.month - a.month : b.year - a.year,
          ),
        };
      }

      case 'GET_BUSINESS_PROFILE':
        return { action: body.action, data: await erp.getBusinessProfile() };

      case 'UPDATE_BUSINESS_PROFILE': {
        const input = updateBusinessProfileSchema.parse(payload);
        return { action: body.action, data: await erp.updateBusinessProfile(input) };
      }

      case 'GET_UNRECONCILED_TRANSACTIONS':
        return {
          action: body.action,
          data: await erp.getUnreconciledTransactions(),
        };

      case 'RECONCILE_TRANSACTION': {
        const input = reconcileSchema.parse(payload);
        return {
          action: body.action,
          data: await erp.reconcileBankTransaction(
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
          data: await ledger.getProfitAndLoss({ from: input.from, to: input.to }),
        };
      }

      case 'GET_BALANCE_SHEET': {
        const input = balanceSheetSchema.parse(payload);
        return {
          action: body.action,
          data: await ledger.getBalanceSheet(input.asOf),
        };
      }

      case 'GET_GENERAL_LEDGER': {
        const input = generalLedgerSchema.parse(payload);
        return {
          action: body.action,
          data: await ledger.getGeneralLedger(input),
        };
      }

      default:
        throw new LedgerError('VALIDATION', `Unsupported action: ${body.action}`);
    }
  });

  app.post('/api/journals/:id/approve', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const ledger = ledgerFor(request.companyId ?? DEFAULT_COMPANY_ID);
    const entry = await ledger.postJournal(params.id);
    return { data: entry };
  });
}
