/**
 * The 23 model-facing MicroBalance tools.
 *
 * Each definition is registered by `apply()` in `index.ts` through
 * `ctx.tools.register(defineTool(...))`. Tool bodies never throw: every core
 * failure is returned as a `CoreError` and rendered as `ERROR [CODE]: ...`.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { approveJournal, callCore } from './core-client.ts'
import { renderJson } from './render.ts'
import type {
  ApAgingResult,
  ArAgingResult,
  BalanceSheetPayload,
  BalanceSheetResult,
  BillItemInput,
  CreateBillPayload,
  CreateBillResult,
  CreateInvoicePayload,
  CreateInvoiceResult,
  GeneralLedgerPayload,
  GeneralLedgerResult,
  InvoiceItemInput,
  JournalEntry,
  JournalLineInput,
  JsonValue,
  ProfitAndLossPayload,
  ProfitAndLossResult,
  ProposeJournalPayload,
  ReconcileTransactionPayload,
  ReconcileTransactionResult,
  RecordInvoicePaymentPayload,
  RecordInvoicePaymentResult,
  TrialBalanceResult,
  UnreconciledTransactionsResult,
} from './types.ts'

/**
 * Shared output contract: the engine returns heterogeneous JSON documents, so
 * the canonical schema accepts any lossless JSON value. `render` is the single
 * place that turns a value (or a returned `CoreError`) into model-visible text.
 */
const jsonOutput = {
  schema: { type: 'json' as const },
  render: (_args: unknown, value: JsonValue) => [
    { type: 'text' as const, text: renderJson(value) },
  ],
}

// ---------------------------------------------------------------------------
// Read-only tools
// ---------------------------------------------------------------------------

const getTrialBalance = defineTool({
  name: 'get_trial_balance',
  description:
    'Return the trial balance: every account with its id, name, type, debit, credit and signed balance. Call this first to discover accountIds — never invent them.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<TrialBalanceResult>('GET_TRIAL_BALANCE', {}),
})

const getArAging = defineTool({
  name: 'get_ar_aging',
  description:
    'Return accounts-receivable aging buckets and outstanding invoices.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<ArAgingResult>('GET_AR_AGING', {}),
})

const getApAging = defineTool({
  name: 'get_ap_aging',
  description:
    'Return accounts-payable aging buckets and outstanding bills.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<ApAgingResult>('GET_AP_AGING', {}),
})

const getCustomers = defineTool({
  name: 'get_customers',
  description: 'List all customers.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<JsonValue>('GET_CUSTOMERS', {}),
})

const getVendors = defineTool({
  name: 'get_vendors',
  description: 'List all vendors.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<JsonValue>('GET_VENDORS', {}),
})

const getItems = defineTool({
  name: 'get_items',
  description: 'List all inventory items.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<JsonValue>('GET_ITEMS', {}),
})

const getBills = defineTool({
  name: 'get_bills',
  description: 'List all purchase bills.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<JsonValue>('GET_BILLS', {}),
})

const getTaxSummary = defineTool({
  name: 'get_tax_summary',
  description: 'Get VAT and WHT payable balances.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<JsonValue>('GET_TAX_SUMMARY', {}),
})

const getPendingJournals = defineTool({
  name: 'get_pending_journals',
  description: 'List all pending journal entries awaiting approval.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () => callCore<JsonValue>('GET_PENDING_JOURNALS', {}),
})

const getUnreconciledBankTransactions = defineTool({
  name: 'get_unreconciled_bank_transactions',
  description: 'List bank transactions that have not been reconciled yet.',
  parameters: {},
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: () =>
    callCore<UnreconciledTransactionsResult>(
      'GET_UNRECONCILED_TRANSACTIONS',
      {},
    ),
})

const getProfitAndLoss = defineTool({
  name: 'get_profit_and_loss',
  description:
    'Return revenue, expenses and net income for a date range. Uses POSTED journal entries only.',
  parameters: {
    startDate: {
      type: 'string',
      required: true,
      description: 'Period start (ISO date)',
    },
    endDate: {
      type: 'string',
      required: true,
      description: 'Period end (ISO date)',
    },
  },
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: (args) => {
    const payload: ProfitAndLossPayload = {
      from: args.startDate,
      to: args.endDate,
    }
    return callCore<ProfitAndLossResult>('GET_PROFIT_AND_LOSS', payload)
  },
})

const getBalanceSheet = defineTool({
  name: 'get_balance_sheet',
  description: 'Return assets, liabilities, equity and net income as of a date.',
  parameters: {
    asOfDate: {
      type: 'string',
      required: true,
      description: 'Balance sheet date (ISO)',
    },
  },
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: (args) => {
    const payload: BalanceSheetPayload = { asOf: args.asOfDate }
    return callCore<BalanceSheetResult>('GET_BALANCE_SHEET', payload)
  },
})

const getGeneralLedger = defineTool({
  name: 'get_general_ledger',
  description:
    'Return journal lines for an account, optionally limited to a date range. Uses POSTED entries by default.',
  parameters: {
    accountId: {
      type: 'string',
      required: true,
      description: 'Account id from get_trial_balance',
    },
    startDate: {
      type: 'string',
      description: 'Optional start date (ISO)',
    },
    endDate: {
      type: 'string',
      description: 'Optional end date (ISO)',
    },
  },
  output: jsonOutput,
  isConcurrencySafe: () => true,
  execute: (args) => {
    const payload: GeneralLedgerPayload = {
      accountId: args.accountId,
      ...(args.startDate !== undefined ? { from: args.startDate } : {}),
      ...(args.endDate !== undefined ? { to: args.endDate } : {}),
    }
    return callCore<GeneralLedgerResult>('GET_GENERAL_LEDGER', payload)
  },
})

// ---------------------------------------------------------------------------
// Journal tools
// ---------------------------------------------------------------------------

const proposeJournalEntry = defineTool({
  name: 'propose_journal_entry',
  description:
    'Create a PENDING double-entry journal proposal. Total debits must equal total credits. Balances do not change until the proposal is approved.',
  parameters: {
    memo: {
      type: 'string',
      required: true,
      description: 'Short description of the transaction',
    },
    lines: {
      type: 'array',
      required: true,
      description: 'Journal lines. Sum of debits must equal sum of credits.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accountId: {
            type: 'string',
            required: true,
            description: 'Account id from get_trial_balance',
          },
          debit: {
            type: 'string',
            description:
              'Debit amount as a decimal string (e.g. "500.00"). Omit or "0" when not a debit.',
          },
          credit: {
            type: 'string',
            description:
              'Credit amount as a decimal string (e.g. "500.00"). Omit or "0" when not a credit.',
          },
        },
      },
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload: ProposeJournalPayload = {
      memo: args.memo,
      lines: args.lines satisfies JournalLineInput[],
    }
    return callCore<JournalEntry>('PROPOSE_JOURNAL', payload)
  },
})

const approveJournalTool = defineTool({
  name: 'approve_journal',
  description:
    "Post a PENDING journal entry to the ledger. Only use this when the user explicitly says 'post', 'finalize' or 'approve'.",
  parameters: {
    journalId: {
      type: 'string',
      required: true,
      description: 'Journal entry id returned by propose_journal_entry',
    },
  },
  output: jsonOutput,
  execute: (args) => approveJournal(args.journalId),
})

const approveJournalById = defineTool({
  name: 'approve_journal_by_id',
  description:
    "Approve a pending journal entry. Only use this when the user explicitly says 'post', 'finalize' or 'approve' and has confirmed the journal. If the id is unknown, call get_pending_journals first.",
  parameters: {
    journalId: {
      type: 'string',
      required: true,
      description: 'Journal entry id from get_pending_journals',
    },
  },
  output: jsonOutput,
  execute: (args) => approveJournal(args.journalId),
})

// ---------------------------------------------------------------------------
// Sales tools
// ---------------------------------------------------------------------------

const createInvoice = defineTool({
  name: 'create_invoice',
  description:
    'Create a sales invoice for a customer. The engine automatically creates a PENDING accounts-receivable / sales-revenue journal; balances change after approval.',
  parameters: {
    customerId: {
      type: 'string',
      required: true,
      description: 'Customer id',
    },
    date: {
      type: 'string',
      required: true,
      description: 'Invoice date (ISO, e.g. 2026-11-12)',
    },
    items: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          itemId: {
            type: 'string',
            required: true,
            description: 'Catalog item id',
          },
          quantity: {
            type: 'number',
            required: true,
            description: 'Quantity sold',
          },
          unitPrice: {
            type: 'string',
            description:
              'Optional price override; defaults to the catalog price',
          },
        },
      },
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload: CreateInvoicePayload = {
      customerId: args.customerId,
      date: args.date,
      items: args.items satisfies InvoiceItemInput[],
    }
    return callCore<CreateInvoiceResult>('CREATE_INVOICE', payload)
  },
})

const createCustomer = defineTool({
  name: 'create_customer',
  description: 'Create a new customer.',
  parameters: {
    name: {
      type: 'string',
      required: true,
      description: 'Customer name',
    },
    email: {
      type: 'string',
      description: 'Optional email address',
    },
    phone: {
      type: 'string',
      description: 'Optional phone number',
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload = {
      name: args.name,
      ...(args.email !== undefined ? { email: args.email } : {}),
      ...(args.phone !== undefined ? { phone: args.phone } : {}),
    }
    return callCore<JsonValue>('CREATE_CUSTOMER', payload as JsonValue)
  },
})

const recordInvoicePayment = defineTool({
  name: 'record_invoice_payment',
  description:
    'Record a payment against an invoice. Creates a PENDING cash / accounts-receivable journal.',
  parameters: {
    invoiceId: {
      type: 'string',
      required: true,
      description: 'Invoice id',
    },
    amount: {
      type: 'number',
      required: true,
      description: 'Payment amount',
    },
    bankAccountId: {
      type: 'string',
      required: true,
      description: 'Asset account id to debit (e.g. Cash)',
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload: RecordInvoicePaymentPayload = {
      invoiceId: args.invoiceId,
      amount: args.amount,
      bankAccountId: args.bankAccountId,
    }
    return callCore<RecordInvoicePaymentResult>(
      'RECORD_INVOICE_PAYMENT',
      payload,
    )
  },
})

// ---------------------------------------------------------------------------
// Purchase tools
// ---------------------------------------------------------------------------

const createVendor = defineTool({
  name: 'create_vendor',
  description: 'Create a new vendor.',
  parameters: {
    name: {
      type: 'string',
      required: true,
      description: 'Vendor name',
    },
    email: {
      type: 'string',
      description: 'Optional email address',
    },
    phone: {
      type: 'string',
      description: 'Optional phone number',
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload = {
      name: args.name,
      ...(args.email !== undefined ? { email: args.email } : {}),
      ...(args.phone !== undefined ? { phone: args.phone } : {}),
    }
    return callCore<JsonValue>('CREATE_VENDOR', payload as JsonValue)
  },
})

const createItem = defineTool({
  name: 'create_item',
  description: 'Create a new product/item.',
  parameters: {
    name: {
      type: 'string',
      required: true,
      description: 'Item name',
    },
    sku: {
      type: 'string',
      required: true,
      description: 'Stock-keeping unit code',
    },
    price: {
      type: 'number',
      required: true,
      description: 'Selling price',
    },
    cost: {
      type: 'number',
      required: true,
      description: 'Unit cost',
    },
    stockQuantity: {
      type: 'number',
      required: true,
      description: 'Opening stock quantity',
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload = {
      name: args.name,
      sku: args.sku,
      price: args.price,
      cost: args.cost,
      stockQuantity: Math.trunc(args.stockQuantity),
    }
    return callCore<JsonValue>('CREATE_ITEM', payload as JsonValue)
  },
})

const createBill = defineTool({
  name: 'create_bill',
  description:
    'Create a purchase bill for a vendor. The engine automatically creates a PENDING inventory / accounts-payable journal.',
  parameters: {
    vendorId: {
      type: 'string',
      required: true,
      description: 'Vendor id',
    },
    date: {
      type: 'string',
      required: true,
      description: 'Bill date (ISO)',
    },
    items: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          itemId: {
            type: 'string',
            description: 'Optional catalog item id',
          },
          description: {
            type: 'string',
            required: true,
            description: 'Line description',
          },
          quantity: {
            type: 'number',
            required: true,
            description: 'Quantity purchased',
          },
          unitCost: {
            type: 'string',
            required: true,
            description: 'Unit cost as a decimal string',
          },
        },
      },
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload: CreateBillPayload = {
      vendorId: args.vendorId,
      date: args.date,
      items: args.items satisfies BillItemInput[],
    }
    return callCore<CreateBillResult>('CREATE_BILL', payload)
  },
})

// ---------------------------------------------------------------------------
// Bank reconciliation
// ---------------------------------------------------------------------------

const reconcileBankTransaction = defineTool({
  name: 'reconcile_bank_transaction',
  description:
    'Match a bank transaction to an invoice (INFLOW) or a bill (OUTFLOW). Amount must not exceed the outstanding balance and entities cannot be matched twice.',
  parameters: {
    transactionId: {
      type: 'string',
      required: true,
      description: 'Bank transaction id',
    },
    matchedId: {
      type: 'string',
      required: true,
      description: 'Invoice id for INFLOW or bill id for OUTFLOW',
    },
    matchedType: {
      type: 'string',
      required: true,
      enum: ['INVOICE', 'BILL'],
      description: 'INVOICE for inflows, BILL for outflows',
    },
  },
  output: jsonOutput,
  execute: (args) => {
    const payload: ReconcileTransactionPayload = {
      transactionId: args.transactionId,
      matchedId: args.matchedId,
      matchedType: args.matchedType,
    }
    return callCore<ReconcileTransactionResult>(
      'RECONCILE_TRANSACTION',
      payload,
    )
  },
})

/** All 23 tool definitions, in stable registration order. */
export const microbalanceTools: ToolDefinition[] = [
  getTrialBalance,
  proposeJournalEntry,
  approveJournalTool,
  approveJournalById,
  createInvoice,
  createCustomer,
  recordInvoicePayment,
  getArAging,
  createVendor,
  createItem,
  createBill,
  getApAging,
  getCustomers,
  getVendors,
  getItems,
  getBills,
  getTaxSummary,
  getPendingJournals,
  getUnreconciledBankTransactions,
  reconcileBankTransaction,
  getProfitAndLoss,
  getBalanceSheet,
  getGeneralLedger,
]
