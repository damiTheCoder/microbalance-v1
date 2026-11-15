/** Budgeting: annual budgets and budget-vs-actual analysis. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  createBudget,
  formatNaira,
  loadBudgetVsActual,
  loadBudgets,
  type Budget,
  type BudgetVsActual,
} from './core.ts'
import { useTrialBalance } from './useTrialBalance.ts'
import css from './accounting.module.css'

interface DraftLine {
  key: number
  accountId: string
  amount: string
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Budget list plus a create dialog with dynamic account lines. */
export function BudgetsPage() {
  const { data } = useTrialBalance()
  const [budgets, setBudgets] = useState<Budget[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1, accountId: '', amount: '' }])
  const nextKey = useRef(2)
  const [saving, setSaving] = useState(false)

  const accounts = data?.accounts ?? []

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadBudgets()
      .then(setBudgets)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const close = (): void => {
    if (saving) return
    setModalOpen(false)
  }

  const open = (): void => {
    setNotice(null)
    setError(null)
    setName('')
    setYear(new Date().getFullYear())
    setLines([{ key: 1, accountId: '', amount: '' }])
    nextKey.current = 2
    setModalOpen(true)
  }

  const addLine = (): void => {
    const key = nextKey.current
    nextKey.current += 1
    setLines(current => [...current, { key, accountId: '', amount: '' }])
  }

  const removeLine = (key: number): void => {
    setLines(current => (current.length <= 1 ? current : current.filter(line => line.key !== key)))
  }

  const updateLine = (key: number, patch: Partial<DraftLine>): void => {
    setLines(current => current.map(line => (line.key === key ? { ...line, ...patch } : line)))
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    const usable = lines.filter(line => line.accountId !== '' && Number(line.amount) > 0)
    if (usable.length === 0) {
      setError('Add at least one account and amount.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createBudget({
        name: name.trim(),
        fiscalYear: year,
        lines: usable.map(line => ({
          accountId: line.accountId,
          amount: line.amount,
          period: 'ANNUAL',
        })),
      })
      setNotice(`Budget ${created.name} created.`)
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const rows = budgets ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Budgets</h1>
          <p className={css.subtitle}>Annual budgets by ledger account.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className={`${css.button} ${css.primary}`} onClick={open}>
            New Budget
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loading && budgets === null ? (
          <div className={css.empty}>Loading budgets…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No budgets yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Budget Name</th>
                <th className={css.num}>Fiscal Year</th>
                <th>Status</th>
                <th className={css.num}>Total Budgeted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(budget => (
                <tr key={budget.id}>
                  <td>{budget.name}</td>
                  <td className={css.num}>{budget.fiscalYear}</td>
                  <td>{budget.status}</td>
                  <td className={css.num}>{formatNaira(budget.totalBudgeted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div
          className={css.backdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <form
            className={css.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-budget-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-budget-title" className={css.modalTitle}>New Budget</h2>
            <div className={css.modalBody}>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Name</span>
                  <input
                    className={css.input}
                    value={name}
                    onChange={(event) => { setName(event.target.value) }}
                    placeholder="e.g. Q4 2026"
                    autoFocus
                  />
                </label>
                <label className={css.field}>
                  <span className={css.label}>Fiscal year</span>
                  <input
                    className={css.input}
                    type="number"
                    min="2000"
                    max="2100"
                    step="1"
                    value={year}
                    onChange={(event) => { setYear(Number(event.target.value)) }}
                  />
                </label>
              </div>
              <div className={css.lineHeader}>
                <span>Account</span>
                <span>Amount</span>
                <span />
                <span />
              </div>
              <div className={css.lines}>
                {lines.map(line => (
                  <div className={css.lineGrid} key={line.key}>
                    <select
                      className={css.select}
                      value={line.accountId}
                      onChange={(event) => { updateLine(line.key, { accountId: event.target.value }) }}
                    >
                      <option value="">Choose an account…</option>
                      {accounts.map(account => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className={css.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount}
                      onChange={(event) => { updateLine(line.key, { amount: event.target.value }) }}
                      placeholder="0.00"
                    />
                    <span />
                    <button
                      type="button"
                      className={`${css.button} ${css.danger}`}
                      aria-label="Remove line"
                      onClick={() => { removeLine(line.key) }}
                      disabled={lines.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className={css.lineActions}>
                <button type="button" className={css.button} onClick={addLine}>
                  Add line
                </button>
              </div>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || name.trim() === ''}
              >
                {saving ? 'Creating…' : 'Create budget'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Budget vs actual table and chart for one budget. */
export function BudgetVsActualPage() {
  const [budgets, setBudgets] = useState<Budget[] | null>(null)
  const [budgetId, setBudgetId] = useState('')
  const [report, setReport] = useState<BudgetVsActual | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadBudgetsList = useCallback((): void => {
    loadBudgets()
      .then((next) => {
        setBudgets(next)
        setBudgetId(current => current !== '' ? current : (next[0]?.id ?? ''))
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    loadBudgetsList()
  }, [loadBudgetsList])

  useEffect(() => {
    if (budgetId === '') {
      setReport(null)
      return
    }
    setLoading(true)
    setError(null)
    loadBudgetVsActual(budgetId)
      .then(setReport)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [budgetId])

  const rows = report?.lines ?? []
  const chartData = rows.map(line => ({
    name: line.account,
    Budgeted: Number(line.budgeted),
    Actual: Number(line.actual),
  }))

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Budget vs Actual</h1>
          <p className={css.subtitle}>Compare posted activity against the budget.</p>
        </div>
        <label className={css.field}>
          <span className={css.label}>Budget</span>
          <select
            className={css.select}
            value={budgetId}
            onChange={(event) => { setBudgetId(event.target.value) }}
          >
            {(budgets ?? []).map(budget => (
              <option key={budget.id} value={budget.id}>{budget.name}</option>
            ))}
          </select>
        </label>
      </header>

      {error !== null && <div className={css.error}>{error}</div>}

      {loading && report === null ? (
        <div className={css.card}><div className={css.empty}>Loading budget…</div></div>
      ) : report === null ? (
        <div className={css.card}><div className={css.empty}>No budgets yet.</div></div>
      ) : (
        <>
          <div className={css.card}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th className={css.num}>Budgeted</th>
                  <th className={css.num}>Actual</th>
                  <th className={css.num}>Variance</th>
                  <th className={css.num}>Variance %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => {
                  const under = Number(line.variance) >= 0
                  return (
                    <tr key={line.accountId}>
                      <td>{line.account}</td>
                      <td className={css.num}>{formatNaira(line.budgeted)}</td>
                      <td className={css.num}>{formatNaira(line.actual)}</td>
                      <td className={css.num}>{formatNaira(line.variance)}</td>
                      <td className={css.num}>{line.variancePercent.toFixed(2)}%</td>
                      <td>
                        <span className={under ? css.badge : `${css.badge} ${css.badgeBad}`}>
                          {under ? 'Under Budget' : 'Over Budget'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={css.totalRow}>
                  <td>Total</td>
                  <td className={css.num}>{formatNaira(report.totalBudgeted)}</td>
                  <td className={css.num}>{formatNaira(report.totalActual)}</td>
                  <td className={css.num}>{formatNaira(report.totalVariance)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={css.card} style={{ padding: '18px 16px 8px' }}>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(17, 24, 39, 0.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} height={60} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={value => formatNaira(Number(value))} />
                  <Legend />
                  <Bar dataKey="Budgeted" fill="#6b7280" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Actual" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
