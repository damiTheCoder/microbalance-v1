/** Manual Journal page: propose a balanced double-entry journal. */
import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { callCore, formatNaira, type ProposedJournal } from './core.ts'
import { useTrialBalance } from './useTrialBalance.ts'
import css from './accounting.module.css'

interface Line {
  key: number
  accountId: string
  debit: string
  credit: string
}

const today = (): string => new Date().toISOString().slice(0, 10)

const cents = (value: string): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

/** Render the journal form with dynamic lines and engine submission. */
export function ManualJournalPage() {
  const { data, error: loadError, loading } = useTrialBalance()
  const [date, setDate] = useState(today)
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [
    { key: 1, accountId: '', debit: '', credit: '' },
    { key: 2, accountId: '', debit: '', credit: '' },
  ])
  const nextKey = useRef(3)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accounts = data?.accounts ?? []

  const debitCents = useMemo(
    () => lines.reduce((sum, line) => sum + cents(line.debit), 0),
    [lines],
  )
  const creditCents = useMemo(
    () => lines.reduce((sum, line) => sum + cents(line.credit), 0),
    [lines],
  )

  const addLine = (): void => {
    const key = nextKey.current
    nextKey.current += 1
    setLines(current => [...current, { key, accountId: '', debit: '', credit: '' }])
  }

  const removeLine = (key: number): void => {
    setLines(current => (current.length <= 2 ? current : current.filter(line => line.key !== key)))
  }

  const updateLine = (key: number, patch: Partial<Line>): void => {
    setLines(current =>
      current.map(line => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setNotice(null)
    setError(null)

    if (memo.trim() === '') {
      setError('Enter a memo for the journal.')
      return
    }

    const usable = lines.filter(
      line => line.accountId !== '' && (cents(line.debit) > 0 || cents(line.credit) > 0),
    )

    if (usable.length < 2) {
      setError('Add at least two lines with an account and an amount.')
      return
    }

    if (debitCents !== creditCents) {
      setError(
        `Journal is unbalanced: debits ${formatNaira(debitCents / 100)} vs credits ${formatNaira(creditCents / 100)}.`,
      )
      return
    }

    setSaving(true)
    try {
      const proposed = await callCore<ProposedJournal>('PROPOSE_JOURNAL', {
        date,
        memo: memo.trim(),
        lines: usable.map(line => ({
          accountId: line.accountId,
          ...(cents(line.debit) > 0 ? { debit: line.debit } : {}),
          ...(cents(line.credit) > 0 ? { credit: line.credit } : {}),
        })),
      })

      setNotice(
        `Journal proposed successfully. It is PENDING approval. Journal ID: ${proposed.id}`,
      )
      setDate(today())
      setMemo('')
      setLines([
        { key: nextKey.current, accountId: '', debit: '', credit: '' },
        { key: nextKey.current + 1, accountId: '', debit: '', credit: '' },
      ])
      nextKey.current += 2
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Manual Journal</h1>
          <p className={css.subtitle}>
            Propose a double-entry journal. It stays pending until an accountant
            approves it.
          </p>
        </div>
      </header>

      {loadError !== null && (
        <div className={css.error}>
          Could not load accounts: {loadError}
        </div>
      )}

      <form
        className={css.card}
        onSubmit={(event) => {
          void submit(event)
        }}
      >
        <div className={css.form}>
          <div className={css.formRow}>
            <label className={`${css.field} ${css.grow}`}>
              <span className={css.label}>Memo</span>
              <input
                className={css.input}
                value={memo}
                onChange={(event) => {
                  setMemo(event.target.value)
                }}
                placeholder="e.g. Cash sale of goods"
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>Date</span>
              <input
                className={css.input}
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value)
                }}
              />
            </label>
          </div>

          <div>
            <div className={css.lineHeader}>
              <span>Account</span>
              <span>Debit (₦)</span>
              <span>Credit (₦)</span>
              <span />
            </div>
            <div className={css.lines}>
              {lines.map(line => (
                <div className={css.lineGrid} key={line.key}>
                  <select
                    className={css.select}
                    value={line.accountId}
                    disabled={loading}
                    onChange={(event) => {
                      updateLine(line.key, { accountId: event.target.value })
                    }}
                  >
                    <option value="">Select account…</option>
                    {accounts.map(account => (
                      <option key={account.accountId} value={account.accountId}>
                        {account.name} ({account.type})
                      </option>
                    ))}
                  </select>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.debit}
                    placeholder="0.00"
                    onChange={(event) => {
                      updateLine(line.key, {
                        debit: event.target.value,
                        credit: event.target.value === '' ? line.credit : '',
                      })
                    }}
                  />
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.credit}
                    placeholder="0.00"
                    onChange={(event) => {
                      updateLine(line.key, {
                        credit: event.target.value,
                        debit: event.target.value === '' ? line.debit : '',
                      })
                    }}
                  />
                  <button
                    type="button"
                    className={`${css.button} ${css.danger}`}
                    aria-label="Remove line"
                    disabled={lines.length <= 2}
                    onClick={() => {
                      removeLine(line.key)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={css.lineActions}>
            <button type="button" className={css.button} onClick={addLine}>
              Add Line
            </button>
            <div className={css.totals}>
              <span>Debits {formatNaira(debitCents / 100)}</span>
              <span>Credits {formatNaira(creditCents / 100)}</span>
              <span>
                <span
                  className={
                    debitCents === creditCents
                      ? css.badge
                      : `${css.badge} ${css.badgeBad}`
                  }
                >
                  {debitCents === creditCents ? 'Balanced' : 'Out of balance'}
                </span>
              </span>
            </div>
          </div>

          <div className={css.lineActions}>
            <span className={css.muted}>
              Journals are proposals; nothing posts until approved.
            </span>
            <button
              type="submit"
              className={`${css.button} ${css.primary}`}
              disabled={saving || loading}
            >
              {saving ? 'Submitting…' : 'Propose Journal'}
            </button>
          </div>
        </div>
      </form>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}
    </div>
  )
}
