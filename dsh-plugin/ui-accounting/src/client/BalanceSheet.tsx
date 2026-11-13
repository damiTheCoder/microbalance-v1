/** Balance Sheet: assets, liabilities, and equity as of a date. */
import { useEffect, useState } from 'react'
import {
  formatNaira,
  loadBalanceSheet,
  type BalanceSheet,
} from './core.ts'
import css from './accounting.module.css'

const today = (): string => new Date().toISOString().slice(0, 10)

/** Render the balance sheet with an as-of date. */
export function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(today)
  const [report, setReport] = useState<BalanceSheet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    loadBalanceSheet(asOf)
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
  }, [asOf, generation])

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Balance Sheet</h1>
          <p className={css.subtitle}>Assets, liabilities, and equity at a point in time.</p>
        </div>
        <div className={css.filterRow}>
          <label className={css.field}>
            <span className={css.label}>As of</span>
            <input
              className={css.input}
              type="date"
              value={asOf}
              onChange={(event) => {
                setAsOf(event.target.value)
              }}
            />
          </label>
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
        </div>
      </header>

      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.kpiGrid}>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Total Assets</span>
          <strong className={css.kpiValue}>{formatNaira(report?.assets.total ?? 0)}</strong>
        </div>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Total Liabilities</span>
          <strong className={css.kpiValue}>
            {formatNaira(report?.liabilities.total ?? 0)}
          </strong>
        </div>
        <div className={css.kpi}>
          <span className={css.kpiLabel}>Total Equity</span>
          <strong className={css.kpiValue}>{formatNaira(report?.equity.total ?? 0)}</strong>
        </div>
      </div>

      <div className={css.split}>
        <section className={css.card}>
          <div className={css.cardHeading}>Assets</div>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th className={css.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(report?.assets.accounts.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={2} className={css.empty}>
                    No posted asset balances.
                  </td>
                </tr>
              ) : (
                report?.assets.accounts.map(row => (
                  <tr key={row.accountId}>
                    <td>{row.account}</td>
                    <td className={css.num}>{formatNaira(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td>Total Assets</td>
                <td className={css.num}>{formatNaira(report?.assets.total ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className={css.card}>
          <div className={css.cardHeading}>Liabilities</div>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th className={css.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(report?.liabilities.accounts.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={2} className={css.empty}>
                    No posted liability balances.
                  </td>
                </tr>
              ) : (
                report?.liabilities.accounts.map(row => (
                  <tr key={row.accountId}>
                    <td>{row.account}</td>
                    <td className={css.num}>{formatNaira(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td>Total Liabilities</td>
                <td className={css.num}>
                  {formatNaira(report?.liabilities.total ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>

      <section className={css.card}>
        <div className={css.cardHeading}>Equity</div>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Account</th>
              <th className={css.num}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(report?.equity.accounts.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={2} className={css.empty}>
                  No posted equity balances.
                </td>
              </tr>
            ) : (
              report?.equity.accounts.map(row => (
                <tr key={row.accountId}>
                  <td>{row.account}</td>
                  <td className={css.num}>{formatNaira(row.amount)}</td>
                </tr>
              ))
            )}
            <tr>
              <td>Net Income</td>
              <td className={css.num}>{formatNaira(report?.netIncome ?? 0)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className={css.totalRow}>
              <td>
                Total Liabilities &amp; Equity{' '}
                <span
                  className={
                    report?.balanced ? css.badge : `${css.badge} ${css.badgeBad}`
                  }
                >
                  {report?.balanced ? 'Balanced' : 'Out of balance'}
                </span>
              </td>
              <td className={css.num}>
                {formatNaira(report?.totalLiabilitiesAndEquity ?? 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  )
}
