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

      case 'GET_CUSTOMERS':
        return { action: body.action, data: await erpService.getCustomers() };

      case 'GET_INVOICES':
        return { action: body.action, data: await erpService.getInvoices() };

      case 'GET_VENDORS':
        return { action: body.action, data: await erpService.getVendors() };

      case 'CREATE_VENDOR': {
        const input = createVendorSchema.parse(payload);
        return { action: body.action, data: await erpService.createVendor(input) };
      }

      case 'GET_BILLS':
        return { action: body.action, data: await erpService.getBills() };

      case 'GET_ITEMS':
        return { action: body.action, data: await erpService.getItems() };

      case 'CREATE_ITEM': {
        const input = createItemSchema.parse(payload);
        return { action: body.action, data: await erpService.createItem(input) };
      }

      case 'GET_PENDING_JOURNALS':
        return { action: body.action, data: await erpService.getPendingJournals() };

      case 'GET_BANK_ACCOUNTS':
        return { action: body.action, data: await erpService.getBankAccounts() };

      case 'CREATE_CUSTOMER': {
        const input = createCustomerSchema.parse(payload);
        return { action: body.action, data: await erpService.createCustomer(input) };
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

      case 'RECORD_BILL_PAYMENT': {
        const input = recordBillPaymentSchema.parse(payload);
        return {
          action: body.action,
          data: await erpService.recordBillPayment(
            input.billId,
            input.amount,
            input.bankAccountId,
            input.date,
          ),
        };
      }

      case 'GET_WHT_SUMMARY':
        return { action: body.action, data: await erpService.getWhtSummary() };

      case 'GET_AR_AGING': {
        const input = agingSchema.parse(payload);
        return { action: body.action, data: await erpService.getArAging(input.asOf) };
      }

      case 'GET_AP_AGING': {
        const input = agingSchema.parse(payload);
        return { action: body.action, data: await erpService.getApAging(input.asOf) };
      }

      case 'GET_TAX_SUMMARY':
        return { action: body.action, data: await erpService.getTaxSummary() };

      case 'GET_EMPLOYEES':
        return { action: body.action, data: await erpService.getEmployees() };

      case 'CREATE_EMPLOYEE': {
        const input = createEmployeeSchema.parse(payload);
        return { action: body.action, data: await erpService.createEmployee(input) };
      }

      case 'RUN_PAYROLL': {
        const input = runPayrollSchema.parse(payload);
        return { action: body.action, data: await erpService.runPayroll(input.month, input.year) };
      }

      case 'GET_PAYROLL_HISTORY':
        return { action: body.action, data: await erpService.getPayrollHistory() };

      case 'GET_EXPENSE_CATEGORIES':
        return { action: body.action, data: await erpService.getExpenseCategories() };

      case 'CREATE_EXPENSE_CATEGORY': {
        const input = createExpenseCategorySchema.parse(payload);
        return { action: body.action, data: await erpService.createExpenseCategory(input) };
      }

      case 'GET_EXPENSES':
        return { action: body.action, data: await erpService.getExpenses() };

      case 'CREATE_EXPENSE': {
        const input = createExpenseSchema.parse(payload);
        return { action: body.action, data: await erpService.createExpense(input) };
      }

      case 'APPROVE_EXPENSE': {
        const input = approveExpenseSchema.parse(payload);
        return { action: body.action, data: await erpService.approveExpense(input.expenseId) };
      }

      case 'GET_ASSETS':
        return { action: body.action, data: await erpService.getAssets() };

      case 'CREATE_ASSET': {
        const input = createAssetSchema.parse(payload);
        return { action: body.action, data: await erpService.createAsset(input) };
      }

      case 'RUN_DEPRECIATION': {
        const input = runDepreciationSchema.parse(payload);
        return {
          action: body.action,
          data: await erpService.runDepreciation(input.month, input.year),
        };
      }

      case 'DISPOSE_ASSET': {
        const input = disposeAssetSchema.parse(payload);
        return {
          action: body.action,
          data: await erpService.disposeAsset(input.assetId, input.disposalDate, input.proceeds),
        };
      }

      case 'CREATE_BUDGET': {
        const input = createBudgetSchema.parse(payload);
        return { action: body.action, data: await erpService.createBudget(input) };
      }

      case 'GET_BUDGETS':
        return { action: body.action, data: await erpService.getBudgets() };

      case 'GET_BUDGET_VS_ACTUAL': {
        const input = budgetIdSchema.parse(payload);
        return {
          action: body.action,
          data: await erpService.getBudgetVsActual(input.budgetId),
        };
      }

      case 'DELETE_BUDGET': {
        const input = budgetIdSchema.parse(payload);
        return { action: body.action, data: await erpService.deleteBudget(input.budgetId) };
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
