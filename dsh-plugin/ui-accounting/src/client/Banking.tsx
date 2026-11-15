/** Banking: customer payments and bank reconciliation. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  formatNaira,
  loadBankAccounts,
  loadInvoices,
  loadUnreconciledTransactions,
  reconcileTransaction,
  recordInvoicePayment,
  type BankAccount,
  type BankTransaction,
  type InvoiceSummary,
  type UnreconciledTransactions,
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

/** Invoice list with a record-payment dialog against cash or bank. */
export function PaymentsPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null)
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<InvoiceSummary | null>(null)
  const [amount, setAmount] = useState('')
  const [bankId, setBankId] = useState('')
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([loadInvoices(), loadBankAccounts()])
      .then(([nextInvoices, nextBanks]) => {
        setInvoices(nextInvoices)
        setBanks(nextBanks)
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const open = (invoice: InvoiceSummary): void => {
    setNotice(null)
    setError(null)
    setSelected(invoice)
    setAmount(invoice.outstanding)
    setBankId(banks[0]?.id ?? '')
    setDate(today())
  }

  const close = (): void => {
    if (saving) return
    setSelected(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving || selected === null) return
    if (bankId === '') {
      setError('Choose the cash or bank account that received the payment.')
      return
    }
    if (!(Number(amount) > 0)) {
      setError('Enter a payment amount greater than zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await recordInvoicePayment({
        invoiceId: selected.id,
        amount: amount.trim(),
        bankAccountId: bankId,
        date,
      })
      setNotice(
        `Payment for ${selected.invoiceNumber} recorded · journal ${result.journal.status}.`,
      )
      setSelected(null)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const rows = invoices ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Payments</h1>
          <p className={css.subtitle}>Record customer receipts against open invoices.</p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loading && invoices === null ? (
          <div className={css.empty}>Loading invoices…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No invoices yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th className={css.num}>Total</th>
                <th className={css.num}>Paid</th>
                <th className={css.num}>Outstanding</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(invoice => (
                <tr key={invoice.id}>
                  <td className={css.code}>{invoice.invoiceNumber}</td>
                  <td>{invoice.customer}</td>
                  <td className={css.num}>{formatNaira(invoice.total)}</td>
                  <td className={css.num}>{formatNaira(invoice.amountPaid)}</td>
                  <td className={css.num}>{formatNaira(invoice.outstanding)}</td>
                  <td>
                    <button
                      type="button"
                      className={css.button}
                      disabled={Number(invoice.outstanding) <= 0}
                      onClick={() => { open(invoice) }}
                    >
                      {Number(invoice.outstanding) <= 0 ? 'Paid' : 'Record Payment'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected !== null && (
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
            aria-labelledby="record-payment-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="record-payment-title" className={css.modalTitle}>Record Payment</h2>
            <p className={css.muted}>
              {selected.invoiceNumber} · {selected.customer} · outstanding {formatNaira(selected.outstanding)}
            </p>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Amount</span>
                <input
                  className={css.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => { setAmount(event.target.value) }}
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
                  value={date}
                  onChange={(event) => { setDate(event.target.value) }}
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
                disabled={saving || banks.length === 0}
              >
                {saving ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Unreconciled bank transactions with a match-to-invoice dialog. */
export function BankReconPage() {
  const [data, setData] = useState<UnreconciledTransactions | null>(null)
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<BankTransaction | null>(null)
  const [invoiceId, setInvoiceId] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([loadUnreconciledTransactions(), loadInvoices()])
      .then(([nextTransactions, nextInvoices]) => {
        setData(nextTransactions)
        setInvoices(nextInvoices)
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const candidates = invoices.filter(invoice => Number(invoice.outstanding) > 0)

  const open = (transaction: BankTransaction): void => {
    setNotice(null)
    setError(null)
    setSelected(transaction)
    setInvoiceId(candidates[0]?.id ?? '')
  }

  const close = (): void => {
    if (saving) return
    setSelected(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving || selected === null) return
    if (invoiceId === '') {
      setError('Choose an open invoice to match this transaction.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await reconcileTransaction(selected.id, invoiceId, 'INVOICE')
      setNotice(`Matched ${selected.description} to ${candidates.find(invoice => invoice.id === invoiceId)?.invoiceNumber ?? 'invoice'}.`)
      setSelected(null)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const transactions = data?.transactions ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Bank Recon</h1>
          <p className={css.subtitle}>Unreconciled bank transactions waiting for a match.</p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loading && data === null ? (
          <div className={css.empty}>Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className={css.empty}>No unreconciled transactions.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className={css.num}>Amount</th>
                <th>Type</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transactions.map(transaction => (
                <tr key={transaction.id}>
                  <td>{shortDate(transaction.date)}</td>
                  <td>{transaction.description}</td>
                  <td className={css.num}>{formatNaira(transaction.amount)}</td>
                  <td>{transaction.type}</td>
                  <td>
                    <button
                      type="button"
                      className={css.button}
                      disabled={candidates.length === 0}
                      onClick={() => { open(transaction) }}
                    >
                      Match
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected !== null && (
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
            aria-labelledby="match-transaction-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="match-transaction-title" className={css.modalTitle}>Match Transaction</h2>
            <p className={css.muted}>
              {selected.description} · {formatNaira(selected.amount)}
            </p>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Invoice</span>
                <select
                  className={css.select}
                  value={invoiceId}
                  onChange={(event) => { setInvoiceId(event.target.value) }}
                >
                  {candidates.map(invoice => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} · {invoice.customer} · {formatNaira(invoice.outstanding)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || candidates.length === 0}
              >
                {saving ? 'Matching…' : 'Match invoice'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
