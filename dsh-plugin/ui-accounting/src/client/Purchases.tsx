/** Purchases & payables: vendors, bills, and the AP aging report. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createBill,
  createVendor,
  formatNaira,
  loadApAging,
  loadBankAccounts,
  loadBills,
  loadVendors,
  recordBillPayment,
  type ApAging,
  type BankAccount,
  type BillSummary,
  type Vendor,
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

/** Vendor list plus a create dialog backed by CREATE_VENDOR. */
export function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null)
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
    loadVendors()
      .then(setVendors)
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
      const created = await createVendor({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      })
      setNotice(`Vendor ${created.name} added.`)
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

  const rows = vendors ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Vendors</h1>
          <p className={css.subtitle}>Suppliers you buy from on credit.</p>
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
            New Vendor
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>Could not load vendors: {error}</div>}

      <div className={css.card}>
        {loading && vendors === null ? (
          <div className={css.empty}>Loading vendors…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No vendors yet. Add your first one.</div>
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
              {rows.map(vendor => (
                <tr key={vendor.id}>
                  <td>{vendor.name}</td>
                  <td>{vendor.email ?? '—'}</td>
                  <td>{vendor.phone ?? '—'}</td>
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
            aria-labelledby="new-vendor-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-vendor-title" className={css.modalTitle}>New Vendor</h2>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Name</span>
                <input
                  className={css.input}
                  value={name}
                  onChange={(event) => { setName(event.target.value) }}
                  placeholder="e.g. Ace Supplies"
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
                  placeholder="accounts@example.com"
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
                {saving ? 'Creating…' : 'Create vendor'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Bill list plus a create dialog that proposes the expense/AP journal. */
export function BillsPage() {
  const [bills, setBills] = useState<BillSummary[] | null>(null)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [vendorId, setVendorId] = useState('')
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [whtRate, setWhtRate] = useState('0')
  const [saving, setSaving] = useState(false)
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [paying, setPaying] = useState<BillSummary | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [bankId, setBankId] = useState('')
  const [payDate, setPayDate] = useState(today)
  const [paySaving, setPaySaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([loadBills(), loadVendors(), loadBankAccounts()])
      .then(([nextBills, nextVendors, nextBanks]) => {
        setBills(nextBills)
        setVendors(nextVendors)
        setBanks(nextBanks)
      })
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

  const open = (): void => {
    setNotice(null)
    setError(null)
    setVendorId(vendors[0]?.id ?? '')
    setDate(today())
    setDescription('')
    setQuantity('1')
    setUnitCost('')
    setWhtRate('0')
    setModalOpen(true)
  }

  const previewSubtotal = (): number => {
    const count = Number(quantity)
    const cost = Number(unitCost)
    return Number.isFinite(count) && Number.isFinite(cost) ? count * cost : 0
  }
  const previewWht = (): number => previewSubtotal() * (Number(whtRate) / 100)
  const previewNet = (): number => previewSubtotal() - previewWht()

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    if (vendorId === '') {
      setError('Choose a vendor for the bill.')
      return
    }
    if (description.trim() === '' || !(Number(quantity) > 0) || !(Number(unitCost) > 0)) {
      setError('Add a description, quantity, and unit cost.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createBill({
        vendorId,
        date,
        items: [{ description: description.trim(), quantity, unitCost }],
        whtRate,
      })
      setNotice(
        `Bill ${result.bill.billNumber} created for ${formatNaira(result.bill.totalAmount)} · journal ${result.journal.status}.`,
      )
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const openPayment = (bill: BillSummary): void => {
    setNotice(null)
    setError(null)
    setPaying(bill)
    setPayAmount(bill.outstanding)
    setBankId(banks[0]?.id ?? '')
    setPayDate(today())
  }

  const closePayment = (): void => {
    if (paySaving) return
    setPaying(null)
  }

  const submitPayment = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (paySaving || paying === null) return
    if (bankId === '') {
      setError('Choose the bank or cash account used for the payment.')
      return
    }
    setPaySaving(true)
    setError(null)
    try {
      const result = await recordBillPayment(paying.id, payAmount.trim(), bankId, payDate)
      setNotice(
        `Payment for ${result.bill.billNumber} recorded · journal ${result.journal.status}.`,
      )
      setPaying(null)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setPaySaving(false)
    }
  }

  const rows = bills ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Bills</h1>
          <p className={css.subtitle}>Supplier bills received but not yet paid.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className={`${css.button} ${css.primary}`}
            onClick={open}
            disabled={vendors.length === 0}
          >
            New Bill
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}
      {vendors.length === 0 && !loading && (
        <div className={css.muted}>Add a vendor before recording a bill.</div>
      )}

      <div className={css.card}>
        {loading && bills === null ? (
          <div className={css.empty}>Loading bills…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No bills yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Vendor</th>
                <th>Date</th>
                <th className={css.num}>Subtotal</th>
                <th className={css.num}>WHT</th>
                <th className={css.num}>Net Payable</th>
                <th className={css.num}>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(bill => (
                <tr key={bill.id}>
                  <td className={css.code}>{bill.billNumber}</td>
                  <td>{bill.vendor}</td>
                  <td>{shortDate(bill.date)}</td>
                  <td className={css.num}>{formatNaira(bill.total)}</td>
                  <td className={css.num}>{formatNaira(bill.whtAmount)}</td>
                  <td className={css.num}>{formatNaira(bill.netPayable)}</td>
                  <td className={css.num}>{formatNaira(bill.total)}</td>
                  <td>{bill.status}</td>
                  <td>
                    <button
                      type="button"
                      className={css.button}
                      disabled={Number(bill.outstanding) <= 0}
                      onClick={() => { openPayment(bill) }}
                    >
                      {Number(bill.outstanding) <= 0 ? 'Paid' : 'Record Payment'}
                    </button>
                  </td>
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
            aria-labelledby="new-bill-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-bill-title" className={css.modalTitle}>New Bill</h2>
            <div className={css.modalBody}>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Vendor</span>
                  <select
                    className={css.select}
                    value={vendorId}
                    onChange={(event) => { setVendorId(event.target.value) }}
                  >
                    {vendors.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                    ))}
                  </select>
                </label>
                <label className={css.field}>
                  <span className={css.label}>Bill date</span>
                  <input
                    className={css.input}
                    type="date"
                    value={date}
                    onChange={(event) => { setDate(event.target.value) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.label}>WHT rate</span>
                  <select
                    className={css.select}
                    value={whtRate}
                    onChange={(event) => { setWhtRate(event.target.value) }}
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="10">10%</option>
                  </select>
                </label>
              </div>
              <div className={css.lineHeader}>
                <span>Description</span>
                <span>Quantity</span>
                <span>Unit cost</span>
                <span />
              </div>
              <div className={css.lineGrid}>
                <input
                  className={css.input}
                  value={description}
                  onChange={(event) => { setDescription(event.target.value) }}
                  placeholder="e.g. Office supplies"
                />
                <input
                  className={css.input}
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(event) => { setQuantity(event.target.value) }}
                />
                <input
                  className={css.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(event) => { setUnitCost(event.target.value) }}
                  placeholder="0.00"
                />
                <span />
              </div>
              <div className={css.totals}>
                <span>Subtotal <strong>{formatNaira(previewSubtotal())}</strong></span>
                <span>WHT ({whtRate}%) <strong>{formatNaira(previewWht())}</strong></span>
                <span>Net Payable <strong>{formatNaira(previewNet())}</strong></span>
                <span>Total <strong>{formatNaira(previewSubtotal())}</strong></span>
              </div>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || vendorId === ''}
              >
                {saving ? 'Creating…' : 'Create bill'}
              </button>
            </div>
          </form>
        </div>
      )}

      {paying !== null && (
        <div
          className={css.backdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) closePayment()
          }}
        >
          <form
            className={css.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-payment-title"
            onSubmit={(event) => { void submitPayment(event) }}
          >
            <h2 id="bill-payment-title" className={css.modalTitle}>Record Bill Payment</h2>
            <p className={css.muted}>
              {paying.billNumber} · {paying.vendor} · net {formatNaira(paying.netPayable)} · outstanding {formatNaira(paying.outstanding)}
            </p>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Amount</span>
                <input
                  className={css.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(event) => { setPayAmount(event.target.value) }}
                  autoFocus
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>Bank account</span>
                <select
                  className={css.select}
                  value={bankId}
                  onChange={(event) => { setBankId(event.target.value) }}
                >
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>{bank.code} · {bank.name}</option>
                  ))}
                </select>
              </label>
              <label className={css.field}>
                <span className={css.label}>Payment date</span>
                <input
                  className={css.input}
                  type="date"
                  value={payDate}
                  onChange={(event) => { setPayDate(event.target.value) }}
                />
              </label>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={closePayment}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={paySaving || banks.length === 0}
              >
                {paySaving ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** AP aging by vendor: Current / 1–30 / 31–60 / 60+. */
export function ApAgingPage() {
  const [aging, setAging] = useState<ApAging | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadApAging()
      .then(setAging)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const rows = aging?.vendors ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>AP Aging</h1>
          <p className={css.subtitle}>
            Outstanding payables by vendor.
            {aging !== null && ` As of ${shortDate(aging.asOf)}.`}
          </p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error !== null && <div className={css.error}>Could not load AP aging: {error}</div>}

      <div className={css.card}>
        {loading && aging === null ? (
          <div className={css.empty}>Loading aging…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No outstanding bills.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Vendor</th>
                <th className={css.num}>Total Outstanding</th>
                <th className={css.num}>Current</th>
                <th className={css.num}>1–30</th>
                <th className={css.num}>31–60</th>
                <th className={css.num}>60+</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.vendor}>
                  <td>{row.vendor}</td>
                  <td className={css.num}>{formatNaira(row.totalOutstanding)}</td>
                  <td className={css.num}>{formatNaira(row.current)}</td>
                  <td className={css.num}>{formatNaira(row['1-30'])}</td>
                  <td className={css.num}>{formatNaira(row['31-60'])}</td>
                  <td className={css.num}>{formatNaira(row['60+'])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={css.totalRow}>
                <td colSpan={5}>Total outstanding</td>
                <td className={css.num}>{formatNaira(aging?.totalOutstanding ?? '0')}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
