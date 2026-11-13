/** Profit & Loss: revenue and expense activity for a period. */
import { useEffect, useState } from 'react'
import {
  formatNaira,
  loadProfitAndLoss,
  type ProfitAndLoss,
} from './core.ts'
import css from './accounting.module.css'

const today = (): string => new Date().toISOString().slice(0, 10)
const firstOfMonth = (): string => `${today().slice(0, 8)}01`

/** Render the P&L report with a selectable period. */
export function ProfitLossPage() {
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [report, setReport] = useState<ProfitAndLoss | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    loadProfitAndLoss(from, to)
      .then((next) => {
        if (alive) setReport(next)
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [from, to, generation])

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Profit &amp; Loss</h1>
          <p className={css.subtitle}>Revenue and expenses for the selected period.</p>
        </div>
        <button
          type="button"
          className={css.button}
          onClick={() => {
            setGeneration(value => value + 1)
          }}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className={css.filterRow}>
        <label className={css.field}>
          <span className={css.label}>From</span>
          <input
            className={css.input}
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value)
            }}
          />
        </label>
        <label className={css.field}>
          <span className={css.label}>To</span>
          <input
            className={css.input}
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
            }}
          />
        </label>
      </div>

      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.kpiGrid}>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Total Revenue</span>
          <strong className={css.kpiValue}>
            {formatNaira(report?.totalRevenue ?? 0)}
          </strong>
        </div>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Total Expenses</span>
          <strong className={css.kpiValue}>
            {formatNaira(report?.totalExpenses ?? 0)}
          </strong>
        </div>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Net Income</span>
          <strong className={css.kpiValue}>{formatNaira(report?.netIncome ?? 0)}</strong>
        </div>
      </div>

      <div className={css.split}>
        <section className={css.card}>
          <div className={css.cardHeading}>Revenue</div>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th className={css.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(report?.revenue.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={2} className={css.empty}>
                    No posted revenue in this period.
                  </td>
                </tr>
              ) : (
                report?.revenue.map(row => (
                  <tr key={row.accountId}>
                    <td>{row.account}</td>
                    <td className={css.num}>{formatNaira(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td>Total Revenue</td>
                <td className={css.num}>{formatNaira(report?.totalRevenue ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className={css.card}>
          <div className={css.cardHeading}>Expenses</div>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th className={css.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(report?.expenses.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={2} className={css.empty}>
                    No posted expenses in this period.
                  </td>
                </tr>
              ) : (
                report?.expenses.map(row => (
                  <tr key={row.accountId}>
                    <td>{row.account}</td>
                    <td className={css.num}>{formatNaira(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td>Total Expenses</td>
                <td className={css.num}>{formatNaira(report?.totalExpenses ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>
    </div>
  )
}
