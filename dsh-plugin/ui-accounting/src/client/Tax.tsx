/** Tax & compliance: VAT/WHT position and recent pending tax activity. */
import { useCallback, useEffect, useState } from 'react'
import {
  CORE_URL,
  formatNaira,
  loadPendingJournals,
  loadTaxSummary,
  loadWhtSummary,
  type PendingJournal,
  type TaxSummary,
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

/** VAT and WHT cards plus the pending-journal activity feed. */
export function TaxDashboardPage() {
  const [summary, setSummary] = useState<TaxSummary | null>(null)
  const [whtPayable, setWhtPayable] = useState<string | null>(null)
  const [journals, setJournals] = useState<PendingJournal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<'paye' | 'vat' | 'wht' | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([loadTaxSummary(), loadWhtSummary(), loadPendingJournals()])
      .then(([nextSummary, nextWht, nextJournals]) => {
        setSummary(nextSummary)
        setWhtPayable(nextWht.whtPayable)
        setJournals(nextJournals)
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const downloadSchedule = useCallback(
    async (kind: 'paye' | 'vat' | 'wht'): Promise<void> => {
      setDownloading(kind)
      setDownloadError(null)
      try {
        const now = new Date()
        const query = `month=${now.getMonth() + 1}&year=${now.getFullYear()}`
        const response = await fetch(`${CORE_URL}/api/tax/${kind}-schedule?${query}`, {
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
        const disposition = response.headers.get('content-disposition') ?? ''
        const filename = /filename="([^"]+)"/.exec(disposition)?.[1]
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename ?? `${kind}-schedule`
        document.body.append(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
      } catch (cause: unknown) {
        setDownloadError(messageOf(cause))
      } finally {
        setDownloading(null)
      }
    },
    [],
  )

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Tax Dashboard</h1>
          <p className={css.subtitle}>VAT and withholding tax liabilities.</p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error !== null && <div className={css.error}>Could not load tax data: {error}</div>}

      <div className={css.split}>
        <article className={css.kpi}>
          <span className={css.kpiLabel}>VAT Payable (7.5%)</span>
          <strong className={css.kpiValue}>{formatNaira(summary?.vatPayable ?? '0')}</strong>
        </article>
        <article className={css.kpi}>
          <span className={css.kpiLabel}>WHT Payable</span>
          <strong className={css.kpiValue}>{formatNaira(whtPayable ?? summary?.whtPayable ?? '0')}</strong>
        </article>
      </div>

      <div className={`${css.card} ${css.downloadCard}`}>
        <div className={css.downloadHeading}>Download Tax Schedules</div>
        <p className={css.downloadHint}>
          LIRS PAYE and NRS VAT/WHT templates for the current month.
        </p>
        <div className={css.downloadRow}>
          <button
            type="button"
            className={`${css.button} ${css.downloadButton}`}
            onClick={() => { void downloadSchedule('paye') }}
            disabled={downloading !== null}
          >
            {downloading === 'paye'
              ? 'Preparing PAYE…'
              : '📥 Download LIRS PAYE Schedule (.xlsx)'}
          </button>
          <button
            type="button"
            className={`${css.button} ${css.downloadButton}`}
            onClick={() => { void downloadSchedule('vat') }}
            disabled={downloading !== null}
          >
            {downloading === 'vat' ? 'Preparing VAT…' : '📥 Download VAT Return (.csv)'}
          </button>
          <button
            type="button"
            className={`${css.button} ${css.downloadButton}`}
            onClick={() => { void downloadSchedule('wht') }}
            disabled={downloading !== null}
          >
            {downloading === 'wht' ? 'Preparing WHT…' : '📥 Download WHT Schedule (.xlsx)'}
          </button>
        </div>
        {downloadError !== null && (
          <div className={css.error}>Could not download schedule: {downloadError}</div>
        )}
      </div>

      <div className={css.card}>
        <div className={css.cardHeading}>Recent Tax Transactions</div>
        {loading && summary === null ? (
          <div className={css.empty}>Loading activity…</div>
        ) : journals.length === 0 ? (
          <div className={css.empty}>No pending tax activity.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Memo</th>
                <th className={css.num}>Debits</th>
                <th className={css.num}>Credits</th>
              </tr>
            </thead>
            <tbody>
              {journals.map(journal => (
                <tr key={journal.id}>
                  <td>{shortDate(journal.date)}</td>
                  <td>{journal.memo ?? '—'}</td>
                  <td className={css.num}>{formatNaira(journal.totalDebit)}</td>
                  <td className={css.num}>{formatNaira(journal.totalCredit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
