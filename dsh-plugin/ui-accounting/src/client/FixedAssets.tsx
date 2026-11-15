/** Fixed assets: register, disposal, and monthly depreciation. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createAsset,
  disposeAsset,
  formatNaira,
  loadAssets,
  runDepreciation,
  type FixedAsset,
} from './core.ts'
import css from './accounting.module.css'

const today = (): string => new Date().toISOString().slice(0, 10)

const shortDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Asset register with purchase and disposal dialogs. */
export function AssetRegisterPage() {
  const [assets, setAssets] = useState<FixedAsset[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today)
  const [cost, setCost] = useState('')
  const [life, setLife] = useState('5')
  const [salvage, setSalvage] = useState('0')
  const [saving, setSaving] = useState(false)
  const [disposing, setDisposing] = useState<FixedAsset | null>(null)
  const [disposalDate, setDisposalDate] = useState(today)
  const [proceeds, setProceeds] = useState('0')
  const [disposalSaving, setDisposalSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadAssets()
      .then(setAssets)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await createAsset({
        name: name.trim(),
        category: category.trim(),
        purchaseDate,
        cost: cost.trim(),
        usefulLifeYears: life.trim(),
        salvageValue: salvage.trim() === '' ? '0' : salvage.trim(),
      })
      setNotice(`Asset ${result.asset.name} added · journal ${result.journal.status}.`)
      setName('')
      setCategory('')
      setPurchaseDate(today())
      setCost('')
      setLife('5')
      setSalvage('0')
      setCreateOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const closeDisposal = (): void => {
    if (disposalSaving) return
    setDisposing(null)
  }

  const submitDisposal = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (disposalSaving || disposing === null) return
    setDisposalSaving(true)
    setError(null)
    try {
      const result = await disposeAsset(disposing.id, disposalDate, proceeds.trim() || '0')
      setNotice(`Asset ${disposing.name} disposed · journal ${result.journal.status}.`)
      setDisposing(null)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setDisposalSaving(false)
    }
  }

  const rows = assets ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Asset Register</h1>
          <p className={css.subtitle}>Capital assets, depreciation, and disposals.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className={`${css.button} ${css.primary}`}
            onClick={() => {
              setNotice(null)
              setCreateOpen(true)
            }}
          >
            New Asset
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loading && assets === null ? (
          <div className={css.empty}>Loading assets…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No fixed assets yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Category</th>
                <th>Purchase Date</th>
                <th className={css.num}>Cost</th>
                <th className={css.num}>Useful Life</th>
                <th className={css.num}>Accumulated Dep.</th>
                <th className={css.num}>Book Value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(asset => (
                <tr key={asset.id}>
                  <td>{asset.name}</td>
                  <td>{asset.category}</td>
                  <td>{shortDate(asset.purchaseDate)}</td>
                  <td className={css.num}>{formatNaira(asset.cost)}</td>
                  <td className={css.num}>{asset.usefulLifeYears} yr</td>
                  <td className={css.num}>{formatNaira(asset.accumulatedDepreciation)}</td>
                  <td className={css.num}>{formatNaira(asset.bookValue)}</td>
                  <td>
                    {!asset.isDisposed && (
                      <button
                        type="button"
                        className={`${css.button} ${css.danger}`}
                        onClick={() => {
                          setNotice(null)
                          setDisposing(asset)
                          setDisposalDate(today())
                          setProceeds('0')
                        }}
                      >
                        Dispose
                      </button>
                    )}
                    {asset.isDisposed && <span className={css.muted}>Disposed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <div
          className={css.backdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setCreateOpen(false)
          }}
        >
          <form
            className={css.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-asset-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-asset-title" className={css.modalTitle}>New Asset</h2>
            <div className={css.modalBody}>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Name</span>
                  <input
                    className={css.input}
                    value={name}
                    onChange={(event) => { setName(event.target.value) }}
                    placeholder="e.g. Delivery Bike"
                    autoFocus
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Category</span>
                  <input
                    className={css.input}
                    value={category}
                    onChange={(event) => { setCategory(event.target.value) }}
                    placeholder="e.g. Vehicles"
                  />
                </label>
              </div>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Purchase date</span>
                  <input
                    className={css.input}
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => { setPurchaseDate(event.target.value) }}
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Cost</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost}
                    onChange={(event) => { setCost(event.target.value) }}
                  />
                </label>
              </div>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Useful life (years)</span>
                  <input
                    className={css.input}
                    type="number"
                    min="1"
                    step="1"
                    value={life}
                    onChange={(event) => { setLife(event.target.value) }}
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Salvage value</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={salvage}
                    onChange={(event) => { setSalvage(event.target.value) }}
                  />
                </label>
              </div>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={() => { setCreateOpen(false) }}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || name.trim() === '' || category.trim() === '' || cost.trim() === ''}
              >
                {saving ? 'Creating…' : 'Create asset'}
              </button>
            </div>
          </form>
        </div>
      )}

      {disposing !== null && (
        <div
          className={css.backdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDisposal()
          }}
        >
          <form
            className={css.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispose-asset-title"
            onSubmit={(event) => { void submitDisposal(event) }}
          >
            <h2 id="dispose-asset-title" className={css.modalTitle}>Dispose Asset</h2>
            <p className={css.muted}>
              {disposing.name} · book value {formatNaira(disposing.bookValue)}
            </p>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Disposal date</span>
                <input
                  className={css.input}
                  type="date"
                  value={disposalDate}
                  onChange={(event) => { setDisposalDate(event.target.value) }}
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>Proceeds</span>
                <input
                  className={css.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={proceeds}
                  onChange={(event) => { setProceeds(event.target.value) }}
                />
              </label>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={closeDisposal}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.danger}`}
                disabled={disposalSaving}
              >
                {disposalSaving ? 'Disposing…' : 'Dispose asset'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Monthly depreciation preview and confirmation. */
export function DepreciationPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [assets, setAssets] = useState<FixedAsset[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadAssets()
      .then(setAssets)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const active = (assets ?? []).filter(asset => !asset.isDisposed)
  const total = active.reduce((sum, asset) => sum + Number(asset.monthlyDepreciation), 0)
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  const submit = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      const result = await runDepreciation(month, year)
      setNotice(
        `Depreciation ${MONTHS[month - 1]} ${year} · ${formatNaira(result.totalDepreciation)} · journal ${result.journal.status}.`,
      )
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Run Depreciation</h1>
          <p className={css.subtitle}>Straight-line monthly depreciation for active assets.</p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.filterRow}>
        <label className={css.field}>
          <span className={css.label}>Month</span>
          <select
            className={css.select}
            value={month}
            onChange={(event) => { setMonth(Number(event.target.value)) }}
          >
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span className={css.label}>Year</span>
          <select
            className={css.select}
            value={year}
            onChange={(event) => { setYear(Number(event.target.value)) }}
          >
            {years.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${css.button} ${css.primary}`}
          onClick={() => { void submit() }}
          disabled={running || active.length === 0}
        >
          {running ? 'Posting…' : 'Confirm Depreciation'}
        </button>
      </div>

      <div className={css.card}>
        {loading && assets === null ? (
          <div className={css.empty}>Loading assets…</div>
        ) : active.length === 0 ? (
          <div className={css.empty}>No active assets to depreciate.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Category</th>
                <th className={css.num}>Cost</th>
                <th className={css.num}>Monthly Depreciation</th>
              </tr>
            </thead>
            <tbody>
              {active.map(asset => (
                <tr key={asset.id}>
                  <td>{asset.name}</td>
                  <td>{asset.category}</td>
                  <td className={css.num}>{formatNaira(asset.cost)}</td>
                  <td className={css.num}>{formatNaira(asset.monthlyDepreciation)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td colSpan={3}>Total for the month</td>
                <td className={css.num}>{formatNaira(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
