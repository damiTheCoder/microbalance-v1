/** Shared core-engine access for the accounting pages. */

import { CORE_ORIGIN } from './auth-client.ts'

/** Browser origin of microbalance-core. */
export const CORE_URL = CORE_ORIGIN

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export interface Account {
  accountId: string
  code: string
  name: string
  type: AccountType
  category: string
  isSystem: boolean
  debit: string
  credit: string
  balance: string
}

export interface AccountAmount {
  accountId: string
  account: string
  amount: string
}

export interface ProfitAndLoss {
  period: { from: string | null; to: string | null }
  revenue: AccountAmount[]
  expenses: AccountAmount[]
  totalRevenue: string
  totalExpenses: string
  netIncome: string
}

export interface BalanceSheet {
  asOf: string
  assets: { accounts: AccountAmount[]; total: string }
  liabilities: { accounts: AccountAmount[]; total: string }
  equity: { accounts: AccountAmount[]; total: string }
  netIncome: string
  totalLiabilitiesAndEquity: string
  balanced: boolean
}

export interface TrialBalance {
  accounts: Account[]
  totalDebit: string
  totalCredit: string
  balanced: boolean
}

export interface ProposedJournal {
  id: string
  status: string
  memo?: string
  lines?: unknown[]
}

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export interface CustomerInput {
  name: string
  email: string
  phone: string
}

export interface InvoiceLineInput {
  itemId?: string
  description: string
  quantity: string
  unitPrice: string
}

export interface InvoiceInput {
  customerId: string
  date: string
  items: InvoiceLineInput[]
}

export interface InvoiceResult {
  invoice: {
    id: string
    invoiceNumber: string
    totalAmount: string
    status: string
  }
  journal: ProposedJournal
}

export interface AgingBucket {
  key: string
  label: string
  count: number
  total: string
}

export interface AgingInvoice {
  invoiceId: string
  invoiceNumber: string
  customer: string
  date: string
  dueDate: string
  total: string
  amountPaid: string
  outstanding: string
  subtotal: string
  vat: string
  daysPastDue: number
  bucket: string
}

export interface ArAging {
  asOf: string
  buckets: AgingBucket[]
  totalOutstanding: string
  invoices: AgingInvoice[]
}

export interface InvoiceSummary {
  id: string
  invoiceNumber: string
  customerId: string
  customer: string
  date: string
  dueDate: string
  status: string
  total: string
  amountPaid: string
  outstanding: string
}

export interface BankAccount {
  id: string
  code: string
  name: string
  type: AccountType
  balance: string
}

export interface BankTransaction {
  id: string
  date: string
  description: string
  amount: string
  type: string
  status: string
}

export interface UnreconciledTransactions {
  count: number
  transactions: BankTransaction[]
}

export interface PendingJournalLine {
  id: string
  accountId: string
  code: string
  account: string
  debit: string
  credit: string
}

export interface PendingJournal {
  id: string
  date: string
  memo: string | null
  status: string
  totalDebit: string
  totalCredit: string
  lines: PendingJournalLine[]
}

export interface Vendor {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export interface VendorInput {
  name: string
  email: string
  phone: string
}

export interface BillSummary {
  id: string
  billNumber: string
  vendorId: string
  vendor: string
  date: string
  dueDate: string
  status: string
  total: string
  amountPaid: string
  whtRate: string
  whtAmount: string
  netPayable: string
  outstanding: string
}

export interface BillInput {
  vendorId: string
  date: string
  items: Array<{ description: string; quantity: string; unitCost: string }>
  whtRate?: string
}

export interface BillResult {
  bill: {
    id: string
    billNumber: string
    totalAmount: string
    status: string
  }
  journal: ProposedJournal
}

export interface ApAgingVendor {
  vendor: string
  totalOutstanding: string
  current: string
  '1-30': string
  '31-60': string
  '60+': string
}

export interface ApAging {
  asOf: string
  buckets: AgingBucket[]
  totalOutstanding: string
  vendors: ApAgingVendor[]
}

export interface Item {
  id: string
  name: string
  sku: string | null
  price: string
  cost: string
  stockQuantity: number
}

export interface ItemInput {
  name: string
  sku: string
  price: string
  cost: string
  stockQuantity: string
}

export interface TaxSummary {
  vatPayable: string
  whtPayable: string
}

export interface Employee {
  id: string
  name: string
  email: string | null
  basicSalary: string
  housingAllowance: string
  transportAllowance: string
  grossSalary: string
  isActive: boolean
}

export interface EmployeeInput {
  name: string
  email: string
  basicSalary: string
  housingAllowance: string
  transportAllowance: string
  isActive: boolean
}

export interface PayrollRun {
  id: string
  month: string
  year: number
  status: string
  totalGross: string
  totalNet: string
  totalPaye: string
  totalPension: string
  totalNhf: string
}

export interface ExpenseCategory {
  id: string
  name: string
}

export interface Expense {
  id: string
  date: string
  description: string
  amount: string
  categoryId: string
  category: string
  employeeId: string | null
  employee: string | null
  paymentMethod: string
  status: string
  journalEntryId: string | null
}

export interface ExpenseInput {
  date: string
  description: string
  amount: string
  categoryId: string
  employeeId?: string
  paymentMethod: 'CASH' | 'BANK' | 'REIMBURSEMENT'
}

export interface FixedAsset {
  id: string
  name: string
  category: string
  purchaseDate: string
  cost: string
  usefulLifeYears: number
  salvageValue: string
  accumulatedDepreciation: string
  bookValue: string
  monthlyDepreciation: string
  isDisposed: boolean
  disposalDate: string | null
}

export interface AssetInput {
  name: string
  category: string
  purchaseDate: string
  cost: string
  usefulLifeYears: string
  salvageValue: string
}

export interface Budget {
  id: string
  name: string
  fiscalYear: number
  status: string
  startDate: string
  endDate: string
  totalBudgeted: string
}

export interface BudgetLineInput {
  accountId: string
  amount: string
  period?: 'MONTHLY' | 'ANNUAL'
}

export interface BudgetInput {
  name: string
  fiscalYear: number
  lines: BudgetLineInput[]
}

export interface BudgetVarianceLine {
  accountId: string
  code: string
  account: string
  type: string
  period: string
  budgeted: string
  actual: string
  variance: string
  variancePercent: number
}

export interface BudgetVsActual {
  budget: {
    id: string
    name: string
    fiscalYear: number
    status: string
    startDate: string
    endDate: string
  }
  lines: BudgetVarianceLine[]
  totalBudgeted: string
  totalActual: string
  totalVariance: string
}

export interface BusinessProfile {
  id: string
  name: string
  address: string
  phone: string
  email: string
  logoUrl: string | null
  currency: string
  fiscalYearStart: string
  vatRate: string
  whtRateCompany: string
  whtRateIndividual: string
  driveConnected: boolean
  driveSyncSchedule: string
  updatedAt: string
}

export interface BusinessProfileInput {
  name: string
  address: string
  phone: string
  email: string
  currency: string
  fiscalYearStart: string
  vatRate: string
  whtRateCompany: string
  whtRateIndividual: string
}

interface CoreEnvelope {
  action?: string
  data?: unknown
  error?: unknown
  code?: unknown
}

/**
 * Call a microbalance-core intent.
 * @param action - intent name, e.g. GET_TRIAL_BALANCE.
 * @param payload - intent payload.
 * @returns the envelope's `data` on success.
 * @throws {Error} with the engine's message on a rejected request.
 */
export async function callCore<T>(action: string, payload: unknown = {}): Promise<T> {
  const response = await fetch(`${CORE_URL}/api/ai-intent`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })

  let body: CoreEnvelope = {}
  try {
    body = (await response.json()) as CoreEnvelope
  } catch {
    // A non-JSON body is reported through the status line below.
  }

  if (!response.ok) {
    const message =
      typeof body.error === 'string'
        ? body.error
        : `Core engine returned HTTP ${response.status}`
    throw new Error(message)
  }

  return body.data as T
}

/** Fetch the chart of accounts through the trial balance intent. */
export function loadTrialBalance(): Promise<TrialBalance> {
  return callCore<TrialBalance>('GET_TRIAL_BALANCE')
}

/** Fetch a profit-and-loss report for a date range. */
export function loadProfitAndLoss(from: string, to: string): Promise<ProfitAndLoss> {
  return callCore<ProfitAndLoss>('GET_PROFIT_AND_LOSS', { from, to })
}

/** Fetch the balance sheet as of a date. */
export function loadBalanceSheet(asOf: string): Promise<BalanceSheet> {
  return callCore<BalanceSheet>('GET_BALANCE_SHEET', { asOf })
}

/** List customers for the sales workspace. */
export function loadCustomers(): Promise<Customer[]> {
  return callCore<Customer[]>('GET_CUSTOMERS')
}

/** Create a customer record. */
export function createCustomer(input: CustomerInput): Promise<Customer> {
  return callCore<Customer>('CREATE_CUSTOMER', input)
}

/** Create a sales invoice; the engine also proposes its AR/revenue journal. */
export function createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  return callCore<InvoiceResult>('CREATE_INVOICE', input)
}

/** Fetch the accounts-receivable aging report. */
export function loadArAging(): Promise<ArAging> {
  return callCore<ArAging>('GET_AR_AGING')
}

/** Every invoice with its customer and outstanding balance. */
export function loadInvoices(): Promise<InvoiceSummary[]> {
  return callCore<InvoiceSummary[]>('GET_INVOICES')
}

/** Cash and bank accounts that can receive a customer payment. */
export function loadBankAccounts(): Promise<BankAccount[]> {
  return callCore<BankAccount[]>('GET_BANK_ACCOUNTS')
}

/** Bank transactions still waiting for a reconciliation match. */
export function loadUnreconciledTransactions(): Promise<UnreconciledTransactions> {
  return callCore<UnreconciledTransactions>('GET_UNRECONCILED_TRANSACTIONS')
}

/** Record a customer payment against an invoice. */
export function recordInvoicePayment(input: {
  invoiceId: string
  amount: string
  bankAccountId: string
  date?: string
}): Promise<{ invoice: { invoiceNumber: string; amountPaid: string }; journal: ProposedJournal }> {
  return callCore('RECORD_INVOICE_PAYMENT', input)
}

/** Match a bank transaction to an invoice. */
export function reconcileTransaction(
  transactionId: string,
  matchedId: string,
  matchedType: 'INVOICE' | 'BILL' = 'INVOICE',
): Promise<unknown> {
  return callCore('RECONCILE_TRANSACTION', { transactionId, matchedId, matchedType })
}

/** Journals waiting for approval, with lines and account names. */
export function loadPendingJournals(): Promise<PendingJournal[]> {
  return callCore<PendingJournal[]>('GET_PENDING_JOURNALS')
}

/** Post a pending journal through the REST approval endpoint. */
export async function approveJournal(id: string): Promise<unknown> {
  const response = await fetch(`${CORE_URL}/api/journals/${id}/approve`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) {
    let message = `Core engine returned HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (typeof body.error === 'string') message = body.error
    } catch {
      // Non-JSON failures keep the status-line message.
    }
    throw new Error(message)
  }
  return response.json()
}

/** All vendors, alphabetical. */
export function loadVendors(): Promise<Vendor[]> {
  return callCore<Vendor[]>('GET_VENDORS')
}

/** Create a vendor record. */
export function createVendor(input: VendorInput): Promise<Vendor> {
  return callCore<Vendor>('CREATE_VENDOR', input)
}

/** Every purchase bill with its vendor. */
export function loadBills(): Promise<BillSummary[]> {
  return callCore<BillSummary[]>('GET_BILLS')
}

/** Create a purchase bill; the engine proposes the expense/AP journal. */
export function createBill(input: BillInput): Promise<BillResult> {
  return callCore<BillResult>('CREATE_BILL', input)
}

/** Accounts-payable aging grouped by vendor. */
export function loadApAging(): Promise<ApAging> {
  return callCore<ApAging>('GET_AP_AGING')
}

/** Pay a supplier bill (net of WHT). */
export function recordBillPayment(
  billId: string,
  amount: string,
  bankAccountId: string,
  date: string,
): Promise<{ bill: { billNumber: string; status: string }; journal: ProposedJournal }> {
  return callCore('RECORD_BILL_PAYMENT', { billId, amount, bankAccountId, date })
}

/** Total WHT withheld from vendor bills. */
export function loadWhtSummary(): Promise<{ whtPayable: string }> {
  return callCore('GET_WHT_SUMMARY')
}

/** Catalog items with prices, costs, and on-hand stock. */
export function loadItems(): Promise<Item[]> {
  return callCore<Item[]>('GET_ITEMS')
}

/** Create a catalog item. */
export function createItem(input: ItemInput): Promise<Item> {
  return callCore<Item>('CREATE_ITEM', input)
}

/** VAT and WHT liabilities for the compliance dashboard. */
export function loadTaxSummary(): Promise<TaxSummary> {
  return callCore<TaxSummary>('GET_TAX_SUMMARY')
}

/** Employees with their salary components. */
export function loadEmployees(): Promise<Employee[]> {
  return callCore<Employee[]>('GET_EMPLOYEES')
}

/** Create an employee record. */
export function createEmployee(input: EmployeeInput): Promise<Employee> {
  return callCore<Employee>('CREATE_EMPLOYEE', input)
}

/** Calculate and propose one month's payroll. */
export function runPayroll(month: number, year: number): Promise<{
  run: { month: string; year: number; totalGross: string; totalNet: string }
  journal: ProposedJournal
}> {
  return callCore('RUN_PAYROLL', { month, year })
}

/** Past payroll runs, newest first. */
export function loadPayrollHistory(): Promise<PayrollRun[]> {
  return callCore<PayrollRun[]>('GET_PAYROLL_HISTORY')
}

/** All expense records with category and employee names. */
export function loadExpenses(): Promise<Expense[]> {
  return callCore<Expense[]>('GET_EXPENSES')
}

export function loadExpenseCategories(): Promise<ExpenseCategory[]> {
  return callCore<ExpenseCategory[]>('GET_EXPENSE_CATEGORIES')
}

export function createExpenseCategory(input: { name: string }): Promise<ExpenseCategory> {
  return callCore<ExpenseCategory>('CREATE_EXPENSE_CATEGORY', input)
}

/** Record an expense; cash/bank entries post immediately. */
export function createExpense(input: ExpenseInput): Promise<{
  expense: { id: string; description: string; status: string }
  journal: ProposedJournal
}> {
  const payload: Record<string, unknown> = {
    date: input.date,
    description: input.description,
    amount: input.amount,
    categoryId: input.categoryId,
    paymentMethod: input.paymentMethod,
  }
  if (input.employeeId !== undefined) payload.employeeId = input.employeeId
  return callCore('CREATE_EXPENSE', payload)
}

/** Approve a pending reimbursement claim and post its journal. */
export function approveExpense(expenseId: string): Promise<unknown> {
  return callCore('APPROVE_EXPENSE', { expenseId })
}

/** All fixed assets with book values. */
export function loadAssets(): Promise<FixedAsset[]> {
  return callCore<FixedAsset[]>('GET_ASSETS')
}

/** Register a fixed asset; the purchase journal is proposed (PENDING). */
export function createAsset(input: AssetInput): Promise<{
  asset: { id: string; name: string; cost: string }
  journal: ProposedJournal
}> {
  return callCore('CREATE_ASSET', input)
}

/** Calculate and propose one month of depreciation. */
export function runDepreciation(month: number, year: number): Promise<{
  totalDepreciation: string
  count: number
  journal: ProposedJournal
}> {
  return callCore('RUN_DEPRECIATION', { month, year })
}

/** Dispose an asset and propose the removal journal. */
export function disposeAsset(
  assetId: string,
  disposalDate: string,
  proceeds: string,
): Promise<{ journal: ProposedJournal; gainOrLoss: string }> {
  return callCore('DISPOSE_ASSET', { assetId, disposalDate, proceeds })
}

/** All budgets with their total budgeted amount. */
export function loadBudgets(): Promise<Budget[]> {
  return callCore<Budget[]>('GET_BUDGETS')
}

/** Create a budget with per-account lines. */
export function createBudget(input: BudgetInput): Promise<{ id: string; name: string }> {
  return callCore('CREATE_BUDGET', input)
}

/** Budget vs actual for one budget. */
export function loadBudgetVsActual(budgetId: string): Promise<BudgetVsActual> {
  return callCore<BudgetVsActual>('GET_BUDGET_VS_ACTUAL', { budgetId })
}

/** Delete a budget and its lines. */
export function deleteBudget(budgetId: string): Promise<{ deleted: boolean }> {
  return callCore('DELETE_BUDGET', { budgetId })
}

/** The single business profile, or null when none has been saved. */
export function loadBusinessProfile(): Promise<BusinessProfile | null> {
  return callCore<BusinessProfile | null>('GET_BUSINESS_PROFILE')
}

/** Create or update the business profile. */
export function updateBusinessProfile(input: BusinessProfileInput): Promise<BusinessProfile> {
  return callCore<BusinessProfile>('UPDATE_BUSINESS_PROFILE', input)
}

/** Format a core decimal string as Naira. */
export function formatNaira(value: string | number | null | undefined): string {
  const amount = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(amount)) return '₦0.00'
  const sign = amount < 0 ? '-' : ''
  return `${sign}₦${Math.abs(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Display order and labels for the grouped chart of accounts. */
export const ACCOUNT_GROUPS: ReadonlyArray<{
  type: AccountType
  label: string
}> = [
  { type: 'ASSET', label: 'Assets' },
  { type: 'LIABILITY', label: 'Liabilities' },
  { type: 'EQUITY', label: 'Equity' },
  { type: 'REVENUE', label: 'Revenue' },
  { type: 'EXPENSE', label: 'Expenses' },
]

/** IFRS display order for the chart of accounts. */
export const ACCOUNT_CATEGORIES: readonly string[] = [
  'Current Assets',
  'Non-current Assets',
  'Current Liabilities',
  'Non-current Liabilities',
  'Equity',
  'Operating Revenue',
  'Operating Expenses',
]
