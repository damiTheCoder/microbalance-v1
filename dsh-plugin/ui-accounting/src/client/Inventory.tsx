/** Inventory: product catalog and a visual stock overview. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createItem,
  formatNaira,
  loadItems,
  type Item,
} from './core.ts'
import css from './accounting.module.css'

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Product catalog with a create dialog backed by CREATE_ITEM. */
export function ProductsPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [stock, setStock] = useState('0')
  const [saving, setSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadItems()
      .then(setItems)
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

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createItem({
        name: name.trim(),
        sku: sku.trim(),
        price: price.trim(),
        cost: cost.trim(),
        stockQuantity: stock.trim(),
      })
      setNotice(`Product ${created.name} added.`)
      setSku('')
      setName('')
      setPrice('')
      setCost('')
      setStock('0')
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const rows = items ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Products</h1>
          <p className={css.subtitle}>Catalog items, prices, costs, and stock on hand.</p>
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
              setModalOpen(true)
            }}
          >
            New Product
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>Could not load products: {error}</div>}

      <div className={css.card}>
        {loading && items === null ? (
          <div className={css.empty}>Loading products…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No products yet. Add your first one.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th className={css.num}>Price</th>
                <th className={css.num}>Cost</th>
                <th className={css.num}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(item => (
                <tr key={item.id}>
                  <td className={css.code}>{item.sku ?? '—'}</td>
                  <td>{item.name}</td>
                  <td className={css.num}>{formatNaira(item.price)}</td>
                  <td className={css.num}>{formatNaira(item.cost)}</td>
                  <td className={css.num}>{item.stockQuantity}</td>
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
            aria-labelledby="new-product-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-product-title" className={css.modalTitle}>New Product</h2>
            <div className={css.modalBody}>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Name</span>
                  <input
                    className={css.input}
                    value={name}
                    onChange={(event) => { setName(event.target.value) }}
                    placeholder="e.g. Bread"
                    autoFocus
                  />
                </label>
                <label className={css.field}>
                  <span className={css.label}>SKU</span>
                  <input
                    className={css.input}
                    value={sku}
                    onChange={(event) => { setSku(event.target.value) }}
                    placeholder="BRD-001"
                  />
                </label>
              </div>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Price</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(event) => { setPrice(event.target.value) }}
                    placeholder="1200.00"
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
                    placeholder="800.00"
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Initial stock</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="1"
                    value={stock}
                    onChange={(event) => { setStock(event.target.value) }}
                  />
                </label>
              </div>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || name.trim() === '' || price.trim() === ''}
              >
                {saving ? 'Creating…' : 'Create product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Stock overview cards: green in stock, red low, grey out. */
export function StockOverviewPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadItems()
      .then(setItems)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const rows = items ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Stock Overview</h1>
          <p className={css.subtitle}>On-hand quantity by product.</p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error !== null && <div className={css.error}>Could not load stock: {error}</div>}

      {loading && items === null ? (
        <div className={css.card}><div className={css.empty}>Loading stock…</div></div>
      ) : rows.length === 0 ? (
        <div className={css.card}><div className={css.empty}>No products yet.</div></div>
      ) : (
        <div className={css.stockGrid}>
          {rows.map((item) => {
            const out = item.stockQuantity === 0
            const low = !out && item.stockQuantity < 5
            const statusClass = out ? css.stockOut : low ? css.stockLow : css.stockIn
            return (
              <article key={item.id} className={css.stockCard}>
                <div>
                  <div className={css.stockName}>{item.name}</div>
                  <div className={css.stockMeta}>{item.sku ?? 'No SKU'}</div>
                </div>
                <div className={css.stockQty}>{item.stockQuantity}</div>
                <span className={`${css.stockStatus} ${statusClass}`}>
                  <span className={css.stockDot} />
                  {out ? 'Out of Stock' : low ? 'Low Stock' : 'In Stock'}
                </span>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
