/** Trial Balance page: every account with debit/credit totals. */
import { formatNaira } from './core.ts'
import { useTrialBalance } from './useTrialBalance.ts'
import css from './accounting.module.css'

/** Render the flat trial balance with its balancing status. */
export function TrialBalancePage() {
  const { data, error, loading, reload } = useTrialBalance()
  const accounts = data?.accounts ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Trial Balance</h1>
          <p className={css.subtitle}>
            Debit and credit totals for every ledger account.
          </p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error !== null && (
        <div className={css.error}>
          Could not load the trial balance: {error}
        </div>
      )}

      <div className={css.card}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account Name</th>
              <th>Type</th>
              <th className={css.num}>Debit</th>
              <th className={css.num}>Credit</th>
              <th className={css.num}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading && data === null ? (
              <tr>
                <td colSpan={6} className={css.empty}>
                  Loading trial balance…
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className={css.empty}>
                  No accounts returned by the engine.
                </td>
              </tr>
            ) : (
              accounts.map(account => (
                <tr key={account.accountId}>
                  <td className={css.code}>{account.code}</td>
                  <td>{account.name}</td>
                  <td>{account.type}</td>
                  <td className={css.num}>{formatNaira(account.debit)}</td>
                  <td className={css.num}>{formatNaira(account.credit)}</td>
                  <td className={css.num}>{formatNaira(account.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
          {data !== null && (
            <tfoot>
              <tr className={css.totalRow}>
                <td colSpan={3}>Total</td>
                <td className={css.num}>{formatNaira(data.totalDebit)}</td>
                <td className={css.num}>{formatNaira(data.totalCredit)}</td>
                <td className={css.num}>
                  <span
                    className={
                      data.balanced ? css.badge : `${css.badge} ${css.badgeBad}`
                    }
                  >
                    {data.balanced ? 'Balanced' : 'Out of balance'}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
