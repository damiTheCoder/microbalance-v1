/** Sales & receivables: customers, invoices, and the AR aging report. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createCustomer,
  createInvoice,
  formatNaira,
  loadArAging,
  loadCustomers,
  loadItems,
  type AgingInvoice,
  type ArAging,
  type Customer,
  type Item,
} from './core.ts'
import css from './accounting.module.css'

const today = (): string => new Date().toISOString().slice(0, 10)

const shortDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

interface DraftLine {
  key: number
  itemId: string | null
  description: string
  quantity: string
  unitPrice: string
}

const blankLine = (key: number): DraftLine => ({
  key,
  itemId: null,
  description: '',
  quantity: '1',
  unitPrice: '',
})

/** Customers list plus a create dialog backed by CREATE_CUSTOMER. */
export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadCustomers()
      .then(setCustomers)
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
      const created = await createCustomer({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      })
      setNotice(`Customer ${created.name} added.`)
      setName('')
      setEmail('')
      setPhone('')
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const rows = customers ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Customers</h1>
          <p className={css.subtitle}>Everyone who buys from you on credit.</p>
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
            New Customer
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>Could not load customers: {error}</div>}

      <div className={css.card}>
        {loading && customers === null ? (
          <div className={css.empty}>Loading customers…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No customers yet. Add your first one.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(customer => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.email ?? '—'}</td>
                  <td>{customer.phone ?? '—'}</td>
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
            aria-labelledby="new-customer-title"
            role="dialog"
            aria-modal="true"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-customer-title" className={css.modalTitle}>New Customer</h2>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Name</span>
                <input
                  className={css.input}
                  value={name}
                  onChange={(event) => { setName(event.target.value) }}
                  placeholder="e.g. Lagos Retail Ltd"
                  autoFocus
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>Email</span>
                <input
                  className={css.input}
                  type="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value) }}
                  placeholder="billing@example.com"
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>Phone</span>
                <input
                  className={css.input}
                  value={phone}
                  onChange={(event) => { setPhone(event.target.value) }}
                  placeholder="+234 …"
                />
              </label>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || name.trim() === ''}
              >
                {saving ? 'Creating…' : 'Create customer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Invoices list plus a create dialog that proposes the AR/revenue journal. */
export function InvoicesPage() {
  const [aging, setAging] = useState<ArAging | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(today)
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine(1)])
  const [productId, setProductId] = useState('')
  const nextKey = useRef(2)
  const [saving, setSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([loadArAging(), loadCustomers(), loadItems()])
      .then(([nextAging, nextCustomers, nextItems]) => {
        setAging(nextAging)
        setCustomers(nextCustomers)
        setItems(nextItems)
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const addLine = (): void => {
    const key = nextKey.current
    nextKey.current += 1
    setLines(current => [...current, blankLine(key)])
  }

  const removeLine = (key: number): void => {
    setLines(current => (current.length <= 1 ? current : current.filter(line => line.key !== key)))
  }

  const updateLine = (key: number, patch: Partial<DraftLine>): void => {
    setLines(current => current.map(line => (line.key === key ? { ...line, ...patch } : line)))
  }

  const addProduct = (id: string): void => {
    const item = items.find(candidate => candidate.id === id)
    if (item === undefined) return
    const key = nextKey.current
    nextKey.current += 1
    setLines(current => [
      ...current,
      { key, itemId: item.id, description: item.name, quantity: '1', unitPrice: item.price },
    ])
  }

  const previewTotal = useMemo(
    () => lines.reduce((sum, line) => {
      const quantity = Number(line.quantity)
      const price = Number(line.unitPrice)
      return Number.isFinite(quantity) && Number.isFinite(price) ? sum + quantity * price : sum
    }, 0),
    [lines],
  )
  const previewVat = Math.round(previewTotal * 0.075 * 100) / 100
  const previewGrandTotal = previewTotal + previewVat

  const close = (): void => {
    if (saving) return
    setModalOpen(false)
  }

  const open = (): void => {
    setNotice(null)
    setError(null)
    setCustomerId(customers[0]?.id ?? '')
    setDate(today())
    setLines([blankLine(1)])
    setProductId('')
    nextKey.current = 2
    setModalOpen(true)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    const items = lines
      .filter(line => line.description.trim() !== ''
        && Number(line.quantity) > 0
        && Number(line.unitPrice) > 0)
      .map(line => ({
        ...(line.itemId !== null ? { itemId: line.itemId } : {}),
        description: line.description.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      }))
    if (customerId === '') {
      setError('Choose a customer for the invoice.')
      return
    }
    if (items.length === 0) {
      setError('Add at least one line with a description, quantity, and price.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createInvoice({ customerId, date, items })
      setNotice(
        `Invoice ${result.invoice.invoiceNumber} created for ${formatNaira(result.invoice.totalAmount)} · journal ${result.journal.status}.`,
      )
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const invoices: AgingInvoice[] = aging?.invoices ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Invoices</h1>
          <p className={css.subtitle}>Open sales invoices and what they still owe.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className={`${css.button} ${css.primary}`}
            onClick={open}
            disabled={customers.length === 0}
          >
            New Invoice
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}
      {customers.length === 0 && !loading && (
        <div className={css.muted}>Add a customer before raising an invoice.</div>
      )}

      <div className={css.card}>
        {loading && aging === null ? (
          <div className={css.empty}>Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className={css.empty}>No open invoices yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Due</th>
                <th className={css.num}>Total</th>
                <th className={css.num}>VAT (₦)</th>
                <th className={css.num}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <tr key={invoice.invoiceId}>
                  <td className={css.code}>{invoice.invoiceNumber}</td>
                  <td>{invoice.customer}</td>
                  <td>{shortDate(invoice.date)}</td>
                  <td>{shortDate(invoice.dueDate)}</td>
                  <td className={css.num}>{formatNaira(invoice.total)}</td>
                  <td className={css.num}>{formatNaira(invoice.vat)}</td>
                  <td className={css.num}>{formatNaira(invoice.outstanding)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td colSpan={6}>Outstanding</td>
                <td className={css.num}>{formatNaira(aging?.totalOutstanding ?? '0')}</td>
              </tr>
            </tfoot>
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
            aria-labelledby="new-invoice-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-invoice-title" className={css.modalTitle}>New Invoice</h2>
            <div className={css.modalBody}>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Customer</span>
                  <select
                    className={css.select}
                    value={customerId}
                    onChange={(event) => { setCustomerId(event.target.value) }}
                  >
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </label>
                <label className={css.field}>
                  <span className={css.label}>Invoice date</span>
                  <input
                    className={css.input}
                    type="date"
                    value={date}
                    onChange={(event) => { setDate(event.target.value) }}
                  />
                </label>
              </div>

              <label className={css.field}>
                <span className={css.label}>Add product</span>
                <select
                  className={css.select}
                  value={productId}
                  onChange={(event) => {
                    const id = event.target.value
                    setProductId('')
                    addProduct(id)
                  }}
                >
                  <option value="">Choose a product…</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.sku !== null ? ` · ${item.sku}` : ''} · stock {item.stockQuantity}
                    </option>
                  ))}
                </select>
              </label>

              <div className={css.lineHeader}>
                <span>Description</span>
                <span>Quantity</span>
                <span>Unit price</span>
                <span />
              </div>
              <div className={css.lines}>
                {lines.map(line => (
                  <div className={css.lineGrid} key={line.key}>
                    <input
                      className={css.input}
                      value={line.description}
                      onChange={(event) => { updateLine(line.key, { description: event.target.value }) }}
                      placeholder="e.g. Consulting services"
                    />
                    <input
                      className={css.input}
                      type="number"
                      min="0"
                      step="1"
                      value={line.quantity}
                      onChange={(event) => { updateLine(line.key, { quantity: event.target.value }) }}
                    />
                    <input
                      className={css.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) => { updateLine(line.key, { unitPrice: event.target.value }) }}
                      placeholder="0.00"
                    />
                    <button
                      type="button"
                      className={`${css.button} ${css.danger}`}
                      aria-label="Remove line"
                      onClick={() => { removeLine(line.key) }}
                      disabled={lines.length <= 1}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className={css.lineActions}>
                <button type="button" className={css.button} onClick={addLine}>
                  Add line
                </button>
                <div className={css.totals}>
                  <span>Subtotal <strong>{formatNaira(previewTotal)}</strong></span>
                  <span>VAT (7.5%) <strong>{formatNaira(previewVat)}</strong></span>
                  <span>Total <strong>{formatNaira(previewGrandTotal)}</strong></span>
                </div>
              </div>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || customerId === ''}
              >
                {saving ? 'Creating…' : 'Create invoice'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

interface AgingGroup {
  label: string
  keys: readonly string[]
}

const AGING_GROUPS: readonly AgingGroup[] = [
  { label: 'Current', keys: ['current'] },
  { label: '1–30 days', keys: ['1-30'] },
  { label: '31–60 days', keys: ['31-60'] },
  { label: '60+ days', keys: ['61-90', '90+'] },
]

/** Accounts-receivable aging, grouped Current / 1–30 / 31–60 / 60+. */
export function ArAgingPage() {
  const [aging, setAging] = useState<ArAging | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadArAging()
      .then(setAging)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const groupTotal = (keys: readonly string[]): number =>
    (aging?.buckets ?? [])
      .filter(bucket => keys.includes(bucket.key))
      .reduce((sum, bucket) => sum + Number(bucket.total), 0)

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>AR Aging</h1>
          <p className={css.subtitle}>
            Outstanding receivables by how long they have been due.
            {aging !== null && ` As of ${shortDate(aging.asOf)}.`}
          </p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error !== null && <div className={css.error}>Could not load AR aging: {error}</div>}

      <div className={css.card}>
        {loading && aging === null ? (
          <div className={css.empty}>Loading aging…</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Due</th>
                <th className={css.num}>Days past due</th>
                <th className={css.num}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {AGING_GROUPS.map((group) => {
                const rows = (aging?.invoices ?? []).filter(invoice => group.keys.includes(invoice.bucket))
                return (
                  <Fragment key={group.label}>
                    <tr className={css.groupRow}>
                      <td colSpan={4}>{group.label}</td>
                      <td className={css.num}>{formatNaira(groupTotal(group.keys))}</td>
                    </tr>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={css.empty}>Nothing in this bucket.</td>
                      </tr>
                    ) : (
                      rows.map(invoice => (
                        <tr key={invoice.invoiceId}>
                          <td className={css.code}>{invoice.invoiceNumber}</td>
                          <td>{invoice.customer}</td>
                          <td>{shortDate(invoice.dueDate)}</td>
                          <td className={css.num}>{invoice.daysPastDue}</td>
                          <td className={css.num}>{formatNaira(invoice.outstanding)}</td>
                        </tr>
                      ))
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td colSpan={4}>Total outstanding</td>
                <td className={css.num}>{formatNaira(aging?.totalOutstanding ?? '0')}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
