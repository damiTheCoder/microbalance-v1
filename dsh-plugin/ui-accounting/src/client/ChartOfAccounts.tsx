/** Chart of Accounts page: the trial balance grouped by account type. */
import { Fragment, useEffect, useState } from 'react'
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_GROUPS,
  formatNaira,
  type Account,
  type AccountType,
} from './core.ts'
import { useTrialBalance } from './useTrialBalance.ts'
import css from './accounting.module.css'

/** Render the grouped chart of accounts with a UI-only New Account dialog. */
export function ChartOfAccountsPage() {
  const { data, error, loading, reload } = useTrialBalance()
  const [modalOpen, setModalOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftType, setDraftType] = useState<AccountType>('ASSET')

  useEffect(() => {
    if (!modalOpen) {
      setDraftName('')
      setDraftType('ASSET')
    }
  }, [modalOpen])

  const accounts: Account[] = data?.accounts ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Chart of Accounts</h1>
          <p className={css.subtitle}>
            Every account in the ledger, grouped by type. Balances come from the
            posted trial balance.
          </p>
        </div>
        <button
          type="button"
          className={`${css.button} ${css.primary}`}
          onClick={() => {
            setModalOpen(true)
          }}
        >
          New Account
        </button>
      </header>

      {error !== null && (
        <div className={css.error}>
          Could not load accounts: {error}{' '}
          <button type="button" className={css.button} onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {loading && data === null ? (
        <div className={css.card}>
          <div className={css.empty}>Loading accounts…</div>
        </div>
      ) : (
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
              {ACCOUNT_CATEGORIES.map((category) => {
                const rows = accounts.filter(account => account.category === category)
                return (
                  <Fragment key={category}>
                    <tr className={css.groupRow}>
                      <td colSpan={6}>{category}</td>
                    </tr>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={css.empty}>
                          No accounts in this category.
                        </td>
                      </tr>
                    ) : (
                      rows.map(account => (
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
                  </Fragment>
                )
              })}
            </tbody>
            {data !== null && (
              <tfoot>
                <tr className={css.totalRow}>
                  <td colSpan={3}>Total</td>
                  <td className={css.num}>{formatNaira(data.totalDebit)}</td>
                  <td className={css.num}>{formatNaira(data.totalCredit)}</td>
                  <td className={css.num}>
                    <span className={data.balanced ? css.badge : `${css.badge} ${css.badgeBad}`}>
                      {data.balanced ? 'Balanced' : 'Out of balance'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {modalOpen && (
        <div
          className={css.backdrop}
          role="presentation"
          onMouseDown={() => {
            setModalOpen(false)
          }}
        >
          <div
            className={css.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-account-title"
            onMouseDown={(event) => {
              event.stopPropagation()
            }}
          >
            <h2 id="new-account-title" className={css.modalTitle}>
              New Account
            </h2>
            <p className={css.muted}>UI preview only — creation is not wired to the engine yet.</p>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Account name</span>
                <input
                  className={css.input}
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value)
                  }}
                  placeholder="e.g. Bank Charges"
                  autoFocus
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>Account type</span>
                <select
                  className={css.select}
                  value={draftType}
                  onChange={(event) => {
                    setDraftType(event.target.value as AccountType)
                  }}
                >
                  {ACCOUNT_GROUPS.map(group => (
                    <option key={group.type} value={group.type}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={css.modalActions}>
              <button
                type="button"
                className={css.button}
                onClick={() => {
                  setModalOpen(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${css.button} ${css.primary}`}
                disabled={draftName.trim() === ''}
                onClick={() => {
                  setModalOpen(false)
                }}
              >
                Create account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
