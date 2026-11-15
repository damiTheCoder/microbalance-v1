/**
 * JSON payload and result shapes for the MicroBalance core engine.
 *
 * Every declaration here is a `type` alias, never an `interface`: DSH tool
 * bodies must return `JsonValue`, and TypeScript only gives object type aliases
 * the implicit index signature that makes them assignable to `JsonValue`.
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export type { JsonValue }

/** The engine's business-error envelope. It is returned, never thrown. */
export type CoreError = {
  isError: true
  error: string
  code: string
}

/** Account classification used by the ledger. */
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

/** Lifecycle of a journal entry. Only POSTED entries affect balances. */
export type JournalStatus = 'PENDING' | 'POSTED'

/** Lifecycle of a sales invoice. */
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID'

/** Lifecycle of a purchase bill. */
export type BillStatus = 'DRAFT' | 'RECEIVED' | 'PAID'

/** Lifecycle of an imported bank transaction. */
export type BankTransactionStatus = 'UNRECONCILED' | 'RECONCILED'

/** Direction of an imported bank transaction. */
export type BankTransactionType = 'INFLOW' | 'OUTFLOW'

/** Document kind an OUTFLOW/INFLOW transaction may be matched to. */
export type MatchedType = 'INVOICE' | 'BILL'

/** Aging bucket keys emitted by the AR/AP reports. */
export type AgingBucketKey = 'current' | '1-30' | '31-60' | '61-90' | '90+'

// ---------------------------------------------------------------------------
// Accounts and journals
// ---------------------------------------------------------------------------

/** One account row in the trial balance. Amounts are decimal strings. */
export type TrialBalanceRow = {
  accountId: string
  name: string
  type: AccountType
  debit: string
  credit: string
  balance: string
}

/** Result of `get_trial_balance`. */
export type TrialBalanceResult = {
  accounts: TrialBalanceRow[]
  totalDebit: string
  totalCredit: string
  balanced: boolean
}

/** One line supplied to `propose_journal_entry`. */
export type JournalLineInput = {
  accountId: string
  debit?: string
  credit?: string
}

/** Embedded account snapshot returned when a posted journal includes accounts. */
export type AccountSnapshot = {
  id: string
  name: string
  type: AccountType
  balance: string
}

/** One persisted journal line. */
export type JournalLine = {
  id: string
  journalEntryId: string
  accountId: string
  debit: string
  credit: string
  account?: AccountSnapshot
}

/** A pending or posted journal entry. */
export type JournalEntry = {
  id: string
  date: string
  memo: string | null
  status: JournalStatus
  lines: JournalLine[]
}

/** Payload for `propose_journal_entry`. */
export type ProposeJournalPayload = {
  memo: string
  lines: JournalLineInput[]
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

/** One catalogue line supplied to `create_invoice`. */
export type InvoiceItemInput = {
  itemId: string
  quantity: number
  unitPrice?: string
}

/** Payload for `create_invoice`. */
export type CreateInvoicePayload = {
  customerId: string
  date: string
  items: InvoiceItemInput[]
}

/** Customer fields embedded in an invoice response. */
export type CustomerSnapshot = {
  id: string
  name: string
}

/** One invoice line. Numeric Prisma decimals serialize as strings. */
export type InvoiceLine = {
  id: string
  invoiceId: string
  itemId: string | null
  description: string
  quantity: string
  unitPrice: string
  total: string
}

/** Invoice fields shared by create and payment responses. */
export type InvoiceSummary = {
  id: string
  customerId: string
  invoiceNumber: string
  date: string
  dueDate: string
  status: InvoiceStatus
  totalAmount: string
  amountPaid: string
}

/** A newly created invoice, including its lines and customer. */
export type InvoiceWithDetails = InvoiceSummary & {
  lines: InvoiceLine[]
  customer: CustomerSnapshot
}

/** Result of `create_invoice`. */
export type CreateInvoiceResult = {
  invoice: InvoiceWithDetails
  journal: JournalEntry
}

/** Payload for `record_invoice_payment`. */
export type RecordInvoicePaymentPayload = {
  invoiceId: string
  amount: number
  bankAccountId: string
}

/** Result of `record_invoice_payment`. */
export type RecordInvoicePaymentResult = {
  invoice: InvoiceSummary
  journal: JournalEntry
}

/** One bucket row in an AR/AP aging report. */
export type AgingBucket = {
  key: AgingBucketKey
  label: string
  count: number
  total: string
}

/** One outstanding invoice in the AR aging report. */
export type ArAgingItem = {
  invoiceId: string
  invoiceNumber: string
  customer: string
  date: string
  dueDate: string
  total: string
  amountPaid: string
  outstanding: string
  daysPastDue: number
  bucket: AgingBucketKey
}

/** Result of `get_ar_aging`. */
export type ArAgingResult = {
  asOf: string
  buckets: AgingBucket[]
  totalOutstanding: string
  invoices: ArAgingItem[]
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

/** One line supplied to `create_bill`. */
export type BillItemInput = {
  itemId?: string
  description: string
  quantity: number
  unitCost: string
}

/** Payload for `create_bill`. */
export type CreateBillPayload = {
  vendorId: string
  date: string
  items: BillItemInput[]
}

/** Vendor fields embedded in a bill response. */
export type VendorSnapshot = {
  id: string
  name: string
}

/** One bill line. Numeric Prisma decimals serialize as strings. */
export type BillLine = {
  id: string
  billId: string
  description: string
  quantity: string
  unitCost: string
  total: string
}

/** Bill fields shared by the create response. */
export type BillSummary = {
  id: string
  vendorId: string
  billNumber: string
  date: string
  dueDate: string
  status: BillStatus
  totalAmount: string
  amountPaid: string
}

/** A newly created bill, including its lines and vendor. */
export type BillWithDetails = BillSummary & {
  lines: BillLine[]
  vendor: VendorSnapshot
}

/** Result of `create_bill`. */
export type CreateBillResult = {
  bill: BillWithDetails
  journal: JournalEntry
}

/** One outstanding bill in the AP aging report. */
export type ApAgingItem = {
  billId: string
  billNumber: string
  vendor: string
  date: string
  dueDate: string
  total: string
  amountPaid: string
  outstanding: string
  daysPastDue: number
  bucket: AgingBucketKey
}

/** Result of `get_ap_aging`. */
export type ApAgingResult = {
  asOf: string
  buckets: AgingBucket[]
  totalOutstanding: string
  bills: ApAgingItem[]
}

// ---------------------------------------------------------------------------
// Bank reconciliation
// ---------------------------------------------------------------------------

/** One imported bank transaction. */
export type BankTransaction = {
  id: string
  date: string
  description: string
  amount: string
  type: BankTransactionType
  status: BankTransactionStatus
}

/** Result of `get_unreconciled_bank_transactions`. */
export type UnreconciledTransactionsResult = {
  count: number
  transactions: BankTransaction[]
}

/** Payload for `reconcile_bank_transaction`. */
export type ReconcileTransactionPayload = {
  transactionId: string
  matchedId: string
  matchedType: MatchedType
}

/** Result of `reconcile_bank_transaction`: the updated transaction. */
export type ReconcileTransactionResult = BankTransaction & {
  matchedInvoiceId: string | null
  matchedBillId: string | null
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** One account amount in a financial report. */
export type ReportAccountLine = {
  accountId: string
  account: string
  amount: string
}

/** Inclusive date range echoed by `get_profit_and_loss`. */
export type ReportPeriod = {
  from: string | null
  to: string | null
}

/** Result of `get_profit_and_loss`. */
export type ProfitAndLossResult = {
  period: ReportPeriod
  revenue: ReportAccountLine[]
  expenses: ReportAccountLine[]
  totalRevenue: string
  totalExpenses: string
  netIncome: string
}

/** One section of a balance sheet. */
export type BalanceSheetSection = {
  accounts: ReportAccountLine[]
  total: string
}

/** Result of `get_balance_sheet`. */
export type BalanceSheetResult = {
  asOf: string
  assets: BalanceSheetSection
  liabilities: BalanceSheetSection
  equity: BalanceSheetSection
  netIncome: string
  totalLiabilitiesAndEquity: string
  balanced: boolean
}

/** One journal line in the general ledger. */
export type GeneralLedgerEntry = {
  journalLineId: string
  journalEntryId: string
  date: string
  memo: string | null
  status: JournalStatus
  accountId: string
  account: string
  accountType: AccountType
  debit: string
  credit: string
}

/** Result of `get_general_ledger`. */
export type GeneralLedgerResult = {
  entries: GeneralLedgerEntry[]
  totalDebit: string
  totalCredit: string
}

/** Payload for `get_profit_and_loss`. */
export type ProfitAndLossPayload = {
  from: string
  to: string
}

/** Payload for `get_balance_sheet`. */
export type BalanceSheetPayload = {
  asOf: string
}

/** Payload for `get_general_ledger`. */
export type GeneralLedgerPayload = {
  accountId: string
  from?: string
  to?: string
}
