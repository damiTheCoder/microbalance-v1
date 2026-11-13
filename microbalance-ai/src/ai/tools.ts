import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { approveJournal, callCore } from '../core/client.js';

type Args = Record<string, unknown>;

const amountType = {
  type: SchemaType.STRING,
  description: 'Decimal amount, e.g. "500.00".',
} as const;

/** Coerce Gemini's number-or-string amounts to a value the core accepts. */
function asAmount(value: unknown): string | number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'number' ? value : String(value).trim();
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function normalizeLines(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((line) => {
    const raw = (line ?? {}) as Args;
    const out: Record<string, unknown> = {
      accountId: String(raw.accountId ?? ''),
    };
    const debit = asAmount(raw.debit);
    const credit = asAmount(raw.credit);
    if (debit !== undefined) out.debit = debit;
    if (credit !== undefined) out.credit = credit;
    return out;
  });
}

function normalizeInvoiceItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((line) => {
    const raw = (line ?? {}) as Args;
    const out: Record<string, unknown> = { quantity: asAmount(raw.quantity) };
    const itemId = asString(raw.itemId);
    const description = asString(raw.description);
    const unitPrice = asAmount(raw.unitPrice);
    if (itemId !== undefined) out.itemId = itemId;
    if (description !== undefined) out.description = description;
    if (unitPrice !== undefined) out.unitPrice = unitPrice;
    return out;
  });
}

function normalizeBillItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((line) => {
    const raw = (line ?? {}) as Args;
    const itemId = asString(raw.itemId);
    return {
      description:
        asString(raw.description) ?? itemId ?? 'Item',
      quantity: asAmount(raw.quantity),
      unitCost: asAmount(raw.unitCost),
    };
  });
}

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_trial_balance',
    description: 'List accounts and IDs.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'propose_journal_entry',
    description: 'Propose a double-entry journal.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        memo: { type: SchemaType.STRING, description: 'Journal memo.' },
        lines: {
          type: SchemaType.ARRAY,
          description: 'Balanced debit/credit lines.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              accountId: { type: SchemaType.STRING, description: 'Account ID.' },
              debit: amountType,
              credit: amountType,
            },
            required: ['accountId'],
          },
        },
      },
      required: ['lines'],
    },
  },
  {
    name: 'approve_journal',
    description: 'Post a pending journal.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        journalId: { type: SchemaType.STRING, description: 'Journal ID.' },
      },
      required: ['journalId'],
    },
  },
  {
    name: 'create_invoice',
    description: 'Create a sales invoice.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customerId: { type: SchemaType.STRING, description: 'Customer ID.' },
        items: {
          type: SchemaType.ARRAY,
          description: 'Invoice line items.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              itemId: { type: SchemaType.STRING, description: 'Item ID.' },
              quantity: amountType,
              unitPrice: amountType,
            },
            required: ['quantity'],
          },
        },
        date: { type: SchemaType.STRING, description: 'ISO date.' },
      },
      required: ['customerId', 'items', 'date'],
    },
  },
  {
    name: 'record_invoice_payment',
    description: 'Record invoice payment.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        invoiceId: { type: SchemaType.STRING, description: 'Invoice ID.' },
        amount: amountType,
        bankAccountId: { type: SchemaType.STRING, description: 'Bank account ID.' },
      },
      required: ['invoiceId', 'amount', 'bankAccountId'],
    },
  },
  {
    name: 'get_ar_aging',
    description: 'Accounts receivable aging.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'create_bill',
    description: 'Create a purchase bill.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        vendorId: { type: SchemaType.STRING, description: 'Vendor ID.' },
        items: {
          type: SchemaType.ARRAY,
          description: 'Bill line items.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              itemId: { type: SchemaType.STRING, description: 'Item ID.' },
              description: { type: SchemaType.STRING, description: 'Line description.' },
              quantity: amountType,
              unitCost: amountType,
            },
            required: ['description', 'quantity', 'unitCost'],
          },
        },
        date: { type: SchemaType.STRING, description: 'ISO date.' },
      },
      required: ['vendorId', 'items', 'date'],
    },
  },
  {
    name: 'get_ap_aging',
    description: 'Accounts payable aging.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_unreconciled_bank_transactions',
    description: 'List unreconciled bank txns.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'reconcile_bank_transaction',
    description: 'Reconcile a bank txn.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        transactionId: { type: SchemaType.STRING, description: 'Bank transaction ID.' },
        matchedId: { type: SchemaType.STRING, description: 'Invoice or bill ID.' },
        matchedType: {
          type: SchemaType.STRING,
          description: 'INVOICE or BILL.',
        },
      },
      required: ['transactionId', 'matchedId', 'matchedType'],
    },
  },
  {
    name: 'get_profit_and_loss',
    description: 'P&L for a period.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDate: { type: SchemaType.STRING, description: 'ISO start date.' },
        endDate: { type: SchemaType.STRING, description: 'ISO end date.' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_balance_sheet',
    description: 'Balance sheet as of date.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        asOfDate: { type: SchemaType.STRING, description: 'ISO as-of date.' },
      },
      required: ['asOfDate'],
    },
  },
  {
    name: 'get_general_ledger',
    description: 'Ledger for an account.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        accountId: { type: SchemaType.STRING, description: 'Account ID.' },
        startDate: { type: SchemaType.STRING, description: 'ISO start date.' },
        endDate: { type: SchemaType.STRING, description: 'ISO end date.' },
      },
      required: ['accountId'],
    },
  },
];

export function geminiFunctionDeclarations(): FunctionDeclaration[] {
  return toolDeclarations;
}

/** Execute a Gemini function call against the core engine. */
export async function executeTool(name: string, rawArgs: unknown): Promise<unknown> {
  const args = (rawArgs ?? {}) as Args;

  switch (name) {
    case 'get_trial_balance':
      return callCore('GET_TRIAL_BALANCE');

    case 'propose_journal_entry':
      return callCore('PROPOSE_JOURNAL', {
        memo: asString(args.memo),
        lines: normalizeLines(args.lines),
      });

    case 'approve_journal':
      return approveJournal(String(args.journalId ?? ''));

    case 'create_invoice':
      return callCore('CREATE_INVOICE', {
        customerId: asString(args.customerId),
        date: asString(args.date),
        items: normalizeInvoiceItems(args.items),
      });

    case 'record_invoice_payment':
      return callCore('RECORD_INVOICE_PAYMENT', {
        invoiceId: asString(args.invoiceId),
        amount: asAmount(args.amount),
        bankAccountId: asString(args.bankAccountId),
      });

    case 'get_ar_aging':
      return callCore('GET_AR_AGING');

    case 'create_bill':
      return callCore('CREATE_BILL', {
        vendorId: asString(args.vendorId),
        date: asString(args.date),
        items: normalizeBillItems(args.items),
      });

    case 'get_ap_aging':
      return callCore('GET_AP_AGING');

    case 'get_unreconciled_bank_transactions':
      return callCore('GET_UNRECONCILED_TRANSACTIONS');

    case 'reconcile_bank_transaction':
      return callCore('RECONCILE_TRANSACTION', {
        transactionId: asString(args.transactionId),
        matchedId: asString(args.matchedId),
        matchedType: asString(args.matchedType),
      });

    case 'get_profit_and_loss':
      return callCore('GET_PROFIT_AND_LOSS', {
        from: asString(args.startDate),
        to: asString(args.endDate),
      });

    case 'get_balance_sheet':
      return callCore('GET_BALANCE_SHEET', { asOf: asString(args.asOfDate) });

    case 'get_general_ledger':
      return callCore('GET_GENERAL_LEDGER', {
        accountId: asString(args.accountId),
        from: asString(args.startDate),
        to: asString(args.endDate),
      });

    default:
      return { error: `unknown tool: ${name}`, code: 'UNKNOWN_TOOL' };
  }
}
