/** Shared core-engine access for the accounting pages. */

/** Browser origin of microbalance-core. */
export const CORE_URL = 'http://localhost:3001'

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
