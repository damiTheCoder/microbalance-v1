/** Journal approvals: pending proposals waiting to post to the ledger. */
import { useCallback, useEffect, useState } from 'react'
import {
  approveJournal,
  formatNaira,
  loadPendingJournals,
  type PendingJournal,
} from './core.ts'
import css from './accounting.module.css'

const shortDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Pending journals with a per-row approve action. */
export function ApprovalsPage() {
  const [journals, setJournals] = useState<PendingJournal[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadPendingJournals()
      .then(setJournals)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const approve = async (journal: PendingJournal): Promise<void> => {
    setApproving(journal.id)
    setError(null)
    setNotice(null)
    try {
      await approveJournal(journal.id)
      setNotice(`Approved ${journal.memo ?? 'journal'}.`)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setApproving(null)
    }
  }

  const rows = journals ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Journal Approvals</h1>
          <p className={css.subtitle}>Pending proposals; approving posts them to the ledger.</p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loading && journals === null ? (
          <div className={css.empty}>Loading pending journals…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>Nothing waiting for approval.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Memo</th>
                <th className={css.num}>Debits</th>
                <th className={css.num}>Credits</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(journal => (
                <tr key={journal.id}>
                  <td>{shortDate(journal.date)}</td>
                  <td>{journal.memo ?? '—'}</td>
                  <td className={css.num}>{formatNaira(journal.totalDebit)}</td>
                  <td className={css.num}>{formatNaira(journal.totalCredit)}</td>
                  <td>
                    <button
                      type="button"
                      className={`${css.button} ${css.primary}`}
                      disabled={approving !== null}
                      onClick={() => { void approve(journal) }}
                    >
                      {approving === journal.id ? 'Approving…' : 'Approve'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
