/** Audit workspace: immutable audit trail and period locking. */
import { useCallback, useEffect, useState } from 'react'
import { callCore, CORE_URL } from './core.ts'
import css from './accounting.module.css'

interface AuditEntry {
  id: string
  createdAt: string
  userId: string
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
}

interface AuditPage {
  items: AuditEntry[]
  total: number
  page: number
  pageSize: number
}

interface LockedPeriod {
  month: number
  year: number
  count: number
  lockedAt: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'POST', 'APPROVE']
const ENTITIES = [
  'Customer', 'Invoice', 'Journal', 'Bill', 'Vendor', 'Item', 'Employee',
  'PayrollRun', 'Expense', 'ExpenseCategory', 'FixedAsset', 'Budget',
  'BusinessProfile', 'BankTransaction', 'Document',
]

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const when = (value: string): string =>
  new Date(value).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const detailOf = (entry: AuditEntry): string => {
  const source = entry.after ?? entry.before
  if (source === null || source === undefined) return entry.entityId
  try {
    const text = JSON.stringify(source)
    return text.length > 90 ? `${text.slice(0, 90)}…` : text
  } catch {
    return entry.entityId
  }
}

/** Read-only mode is stored locally and hides write buttons via CSS. */
function useReadOnly(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('microbalance.readOnly') === 'true'
  })

  useEffect(() => {
    document.documentElement.dataset.readonly = value ? 'true' : 'false'
  }, [value])

  const update = (next: boolean): void => {
    setValue(next)
    window.localStorage.setItem('microbalance.readOnly', next ? 'true' : 'false')
    document.documentElement.dataset.readonly = next ? 'true' : 'false'
  }

  return [value, update]
}

/** Paginated, filterable audit trail plus the auditor read-only switch. */
export function AuditTrailPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [readOnly, setReadOnly] = useReadOnly()
  const pageSize = 50

  const load = useCallback((): void => {
    setLoading(true)
    setError(null)
    callCore<AuditPage>('GET_AUDIT_LOG', {
      page,
      pageSize,
      ...(action === '' ? {} : { action }),
      ...(entityType === '' ? {} : { entityType }),
    })
      .then((result) => {
        setEntries(result.items)
        setTotal(result.total)
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [page, action, entityType])

  useEffect(() => {
    load()
  }, [load])

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Audit Trail</h1>
          <p className={css.subtitle}>
            Every create, update, approval and posting, in order and immutable.
          </p>
        </div>
        <div className={css.lineActions}>
          <label className={css.toggle}>
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(event) => { setReadOnly(event.target.checked) }}
            />
            Read-only mode
          </label>
          <button type="button" className={css.button} onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className={css.button}
            onClick={() => { window.open(`${CORE_URL}/api/audit/export`, '_blank') }}
          >
            Export Audit JSON
          </button>
        </div>
      </header>

      {readOnly && (
        <div className={css.notice}>
          Read-only mode is on. Write actions are hidden until you switch it off.
        </div>
      )}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        <div className={css.filters}>
          <label className={css.field}>
            <span className={css.label}>Action</span>
            <select
              className={css.select}
              value={action}
              onChange={(event) => { setAction(event.target.value); setPage(1) }}
            >
              <option value="">All actions</option>
              {ACTIONS.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={css.field}>
            <span className={css.label}>Entity</span>
            <select
              className={css.select}
              value={entityType}
              onChange={(event) => { setEntityType(event.target.value); setPage(1) }}
            >
              <option value="">All entities</option>
              {ENTITIES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <span className={css.subtitle}>{total} entries</span>
        </div>

        {entries.length === 0 ? (
          <div className={css.empty}>
            {loading ? 'Loading audit trail…' : 'No audit entries for this filter.'}
          </div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td>{when(entry.createdAt)}</td>
                  <td title={entry.userId}>{entry.userId.slice(0, 10)}…</td>
                  <td><span className={css.badge}>{entry.action}</span></td>
                  <td>{entry.entityType} · {entry.entityId.slice(0, 8)}</td>
                  <td title={detailOf(entry)}>{detailOf(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className={css.lineActions}>
          <button
            type="button"
            className={css.button}
            disabled={page <= 1 || loading}
            onClick={() => { setPage(current => Math.max(1, current - 1)) }}
          >
            Previous
          </button>
          <span className={css.subtitle}>Page {page} of {pages}</span>
          <button
            type="button"
            className={css.button}
            disabled={page >= pages || loading}
            onClick={() => { setPage(current => current + 1) }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

/** Month/year locking of posted and pending journals. */
export function PeriodLockPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [periods, setPeriods] = useState<LockedPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback((): void => {
    setLoading(true)
    setError(null)
    callCore<LockedPeriod[]>('GET_LOCKED_PERIODS')
      .then(setPeriods)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const lock = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await callCore<{ locked: number }>('LOCK_PERIOD', { month, year })
      setNotice(`Locked ${result.locked} journal${result.locked === 1 ? '' : 's'} for ${MONTHS[month - 1]} ${year}.`)
      load()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  const unlock = async (target: LockedPeriod): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await callCore<{ unlocked: number }>('UNLOCK_PERIOD', {
        month: target.month,
        year: target.year,
      })
      setNotice(`Unlocked ${result.unlocked} journal${result.unlocked === 1 ? '' : 's'} for ${MONTHS[target.month - 1]} ${target.year}.`)
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
          <h1 className={css.title}>Period Lock</h1>
          <p className={css.subtitle}>
            Locking a month prevents journals in it from being posted or approved.
          </p>
        </div>
        <button type="button" className={css.button} onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        <div className={css.filters}>
          <label className={css.field}>
            <span className={css.label}>Month</span>
            <select
              className={css.select}
              value={month}
              onChange={(event) => { setMonth(Number(event.target.value)) }}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            <span className={css.label}>Year</span>
            <input
              className={css.input}
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(event) => { setYear(Number(event.target.value)) }}
            />
          </label>
          <button
            type="button"
            className={`${css.button} ${css.primary}`}
            onClick={() => { void lock() }}
            disabled={busy}
          >
            {busy ? 'Locking…' : 'Lock Period'}
          </button>
        </div>
      </div>

      <div className={css.card}>
        {periods.length === 0 ? (
          <div className={css.empty}>{loading ? 'Loading locked periods…' : 'No locked periods.'}</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Period</th>
                <th className={css.num}>Locked Journals</th>
                <th>Locked At</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {periods.map(period => (
                <tr key={`${period.year}-${period.month}`}>
                  <td>{MONTHS[period.month - 1]} {period.year}</td>
                  <td className={css.num}>{period.count}</td>
                  <td>{when(period.lockedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={css.button}
                      disabled={busy}
                      onClick={() => { void unlock(period) }}
                    >
                      Unlock
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
