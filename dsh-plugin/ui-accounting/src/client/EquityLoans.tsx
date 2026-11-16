/** Equity and financing: capital, dividends, loans and repayments. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { callCore, formatNaira } from './core.ts'
import css from './accounting.module.css'

interface EquityEntry {
  id: string
  type: string
  amount: string
  date: string
  description: string
}

interface EquitySummary {
  shareCapital: string
  retainedEarnings: string
  dividends: string
  totalEquity: string
  transactions: EquityEntry[]
}

interface Loan {
  id: string
  lenderName: string
  principalAmount: string
  interestRate: string
  startDate: string
  termMonths: number
  balance: string
  status: string
  repayments: number
}

interface BankAccount {
  id: string
  code: string
  name: string
}

const today = (): string => new Date().toISOString().slice(0, 10)

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const typeLabel = (type: string): string =>
  type === 'SHARE_CAPITAL' ? 'Share capital' : type === 'DIVIDEND' ? 'Dividend' : 'Retained earnings'

/** Capital, retained earnings, dividends, and their journals. */
export function EquityPage() {
  const [summary, setSummary] = useState<EquitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'equity' | 'dividend' | null>(null)
  const [busy, setBusy] = useState(false)

  const [type, setType] = useState<'SHARE_CAPITAL' | 'RETAINED_EARNINGS_ADJUSTMENT'>('SHARE_CAPITAL')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')

  const load = useCallback((): void => {
    setLoading(true)
    setError(null)
    callCore<EquitySummary>('GET_EQUITY_SUMMARY')
      .then(setSummary)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const open = (kind: 'equity' | 'dividend'): void => {
    setDialog(kind)
    setType('SHARE_CAPITAL')
    setAmount('')
    setDate(today())
    setDescription('')
    setNotice(null)
    setError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (dialog === 'equity') {
        await callCore('CREATE_EQUITY', { type, amount, date, description })
        setNotice('Equity journal proposed (PENDING). Approve it in Journal Approvals.')
      } else {
        await callCore('RECORD_DIVIDEND', { amount, date, description })
        setNotice('Dividend journal proposed (PENDING). Approve it in Journal Approvals.')
      }
      setDialog(null)
      load()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Equity</h1>
          <p className={css.subtitle}>Share capital, retained earnings and dividends.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={() => { open('dividend') }}>
            Record Dividend
          </button>
          <button type="button" className={`${css.button} ${css.primary}`} onClick={() => { open('equity') }}>
            Add Equity
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.kpiGrid}>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Share capital</span>
          <span className={css.kpiValue}>{formatNaira(summary?.shareCapital ?? 0)}</span>
        </div>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Retained earnings</span>
          <span className={css.kpiValue}>{formatNaira(summary?.retainedEarnings ?? 0)}</span>
        </div>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Dividends</span>
          <span className={css.kpiValue}>{formatNaira(summary?.dividends ?? 0)}</span>
        </div>
      </div>

      <div className={css.card}>
        {(summary?.transactions.length ?? 0) === 0 ? (
          <div className={css.empty}>{loading ? 'Loading equity…' : 'No equity activity yet.'}</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th className={css.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.transactions ?? []).map(entry => (
                <tr key={entry.id}>
                  <td>{new Date(entry.date).toLocaleDateString('en-NG')}</td>
                  <td>{typeLabel(entry.type)}</td>
                  <td>{entry.description}</td>
                  <td className={css.num}>{formatNaira(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog !== null && (
        <div
          className={css.backdrop}
          onClick={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null) }}
        >
          <form className={css.modal} onSubmit={(event) => { void submit(event) }}>
            <h2 className={css.modalTitle}>{dialog === 'equity' ? 'Add Equity' : 'Record Dividend'}</h2>
            <div className={css.modalBody}>
              {dialog === 'equity' && (
                <label className={css.field}>
                  <span className={css.label}>Type</span>
                  <select className={css.select} value={type} onChange={(event) => { setType(event.target.value as typeof type) }}>
                    <option value="SHARE_CAPITAL">Share capital</option>
                    <option value="RETAINED_EARNINGS_ADJUSTMENT">Retained earnings adjustment</option>
                  </select>
                </label>
              )}
              <label className={css.field}>
                <span className={css.label}>Amount (₦)</span>
                <input className={css.input} type="number" min="0" step="0.01" required value={amount} onChange={(event) => { setAmount(event.target.value) }} />
              </label>
              <label className={css.field}>
                <span className={css.label}>Date</span>
                <input className={css.input} type="date" value={date} onChange={(event) => { setDate(event.target.value) }} />
              </label>
              <label className={css.field}>
                <span className={css.label}>Description</span>
                <input className={css.input} value={description} onChange={(event) => { setDescription(event.target.value) }} placeholder="Optional" />
              </label>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={() => { setDialog(null) }} disabled={busy}>Cancel</button>
              <button type="submit" className={`${css.button} ${css.primary}`} disabled={busy || amount === ''}>
                {busy ? 'Saving…' : dialog === 'equity' ? 'Add equity' : 'Record dividend'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Loan register with repayment posting. */
export function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'loan' | 'repay' | null>(null)
  const [target, setTarget] = useState<Loan | null>(null)

  const [lenderName, setLenderName] = useState('')
  const [principal, setPrincipal] = useState('')
  const [rate, setRate] = useState('10')
  const [startDate, setStartDate] = useState(today())
  const [termMonths, setTermMonths] = useState('12')
  const [amount, setAmount] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')

  const load = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([
      callCore<Loan[]>('GET_LOANS'),
      callCore<BankAccount[]>('GET_BANK_ACCOUNTS'),
    ])
      .then(([nextLoans, nextBanks]) => {
        setLoans(nextLoans)
        setBanks(nextBanks)
        setBankAccountId(current => current !== '' ? current : (nextBanks[0]?.id ?? ''))
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const newLoan = (): void => {
    setDialog('loan')
    setLenderName('')
    setPrincipal('')
    setRate('10')
    setStartDate(today())
    setTermMonths('12')
    setNotice(null)
  }

  const repay = (loan: Loan): void => {
    setDialog('repay')
    setTarget(loan)
    setAmount('')
    setStartDate(today())
    setNotice(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (dialog === 'loan') {
        await callCore('CREATE_LOAN', {
          lenderName,
          principalAmount: principal,
          interestRate: rate,
          startDate,
          termMonths,
        })
        setNotice('Loan journal proposed (PENDING). Approve it in Journal Approvals.')
      } else if (target !== null) {
        const result = await callCore<{ repayment: { principalPaid: string; interestPaid: string } }>(
          'RECORD_LOAN_REPAYMENT',
          { loanId: target.id, amount, bankAccountId, date: startDate },
        )
        setNotice(
          `Repayment posted: principal ${formatNaira(result.repayment.principalPaid)}, interest ${formatNaira(result.repayment.interestPaid)}. Journal pending approval.`,
        )
      }
      setDialog(null)
      load()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Loans</h1>
          <p className={css.subtitle}>Borrowings, balances and repayment schedules.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={load} disabled={loading}>Refresh</button>
          <button type="button" className={`${css.button} ${css.primary}`} onClick={newLoan}>New Loan</button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loans.length === 0 ? (
          <div className={css.empty}>{loading ? 'Loading loans…' : 'No loans yet.'}</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Lender</th>
                <th className={css.num}>Principal</th>
                <th className={css.num}>Rate</th>
                <th className={css.num}>Balance</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loans.map(loan => (
                <tr key={loan.id}>
                  <td>{loan.lenderName}</td>
                  <td className={css.num}>{formatNaira(loan.principalAmount)}</td>
                  <td className={css.num}>{loan.interestRate}%</td>
                  <td className={css.num}>{formatNaira(loan.balance)}</td>
                  <td><span className={css.badge}>{loan.status}</span></td>
                  <td>
                    <button
                      type="button"
                      className={`${css.button} ${css.primary}`}
                      disabled={loan.status === 'PAID'}
                      onClick={() => { repay(loan) }}
                    >
                      Record Repayment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog !== null && (
        <div
          className={css.backdrop}
          onClick={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null) }}
        >
          <form className={css.modal} onSubmit={(event) => { void submit(event) }}>
            <h2 className={css.modalTitle}>{dialog === 'loan' ? 'New Loan' : `Repayment — ${target?.lenderName ?? ''}`}</h2>
            <div className={css.modalBody}>
              {dialog === 'loan' ? (
                <>
                  <label className={css.field}>
                    <span className={css.label}>Lender</span>
                    <input className={css.input} required value={lenderName} onChange={(event) => { setLenderName(event.target.value) }} placeholder="e.g. First Bank" />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Principal (₦)</span>
                    <input className={css.input} type="number" min="0" step="0.01" required value={principal} onChange={(event) => { setPrincipal(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Interest rate (% per year)</span>
                    <input className={css.input} type="number" min="0" max="100" step="0.01" value={rate} onChange={(event) => { setRate(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Term (months)</span>
                    <input className={css.input} type="number" min="1" step="1" value={termMonths} onChange={(event) => { setTermMonths(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Start date</span>
                    <input className={css.input} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value) }} />
                  </label>
                </>
              ) : (
                <>
                  <label className={css.field}>
                    <span className={css.label}>Amount (₦)</span>
                    <input className={css.input} type="number" min="0" step="0.01" required value={amount} onChange={(event) => { setAmount(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Date</span>
                    <input className={css.input} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Bank account</span>
                    <select className={css.select} value={bankAccountId} onChange={(event) => { setBankAccountId(event.target.value) }}>
                      {banks.map(account => (
                        <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={() => { setDialog(null) }} disabled={busy}>Cancel</button>
              <button type="submit" className={`${css.button} ${css.primary}`} disabled={busy || amount === '' && dialog === 'repay'}>
                {busy ? 'Saving…' : dialog === 'loan' ? 'Create loan' : 'Record repayment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
