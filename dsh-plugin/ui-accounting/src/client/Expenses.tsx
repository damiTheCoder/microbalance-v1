/** Expenses: staff claims, cash/bank spend, and expense categories. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  approveExpense,
  createExpense,
  createExpenseCategory,
  formatNaira,
  loadEmployees,
  loadExpenseCategories,
  loadExpenses,
  type Employee,
  type Expense,
  type ExpenseCategory,
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

const methodLabel = (method: string): string =>
  method === 'CASH' ? 'Cash' : method === 'BANK' ? 'Bank' : 'Reimbursement'

/** Expense ledger with a create dialog and reimbursement approvals. */
export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'REIMBURSEMENT'>('CASH')
  const [employeeId, setEmployeeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([loadExpenses(), loadExpenseCategories(), loadEmployees()])
      .then(([nextExpenses, nextCategories, nextEmployees]) => {
        setExpenses(nextExpenses)
        setCategories(nextCategories)
        setEmployees(nextEmployees.filter(employee => employee.isActive))
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
    setDate(today())
    setDescription('')
    setAmount('')
    setCategoryId(categories[0]?.id ?? '')
    setPaymentMethod('CASH')
    setEmployeeId(employees[0]?.id ?? '')
    setModalOpen(true)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    if (categoryId === '') {
      setError('Choose an expense category.')
      return
    }
    if (paymentMethod === 'REIMBURSEMENT' && employeeId === '') {
      setError('Choose the employee claiming the reimbursement.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await createExpense({
        date,
        description: description.trim(),
        amount: amount.trim(),
        categoryId,
        paymentMethod,
        ...(paymentMethod === 'REIMBURSEMENT' ? { employeeId } : {}),
      })
      setNotice(
        `${description.trim()} recorded · journal ${result.journal.status}.`,
      )
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const approve = async (expense: Expense): Promise<void> => {
    setApproving(expense.id)
    setError(null)
    setNotice(null)
    try {
      await approveExpense(expense.id)
      setNotice(`${expense.description} approved and posted.`)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setApproving(null)
    }
  }

  const rows = expenses ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>All Expenses</h1>
          <p className={css.subtitle}>Cash, bank, and employee reimbursement claims.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className={`${css.button} ${css.primary}`}
            onClick={open}
            disabled={categories.length === 0}
          >
            New Expense
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loading && expenses === null ? (
          <div className={css.empty}>Loading expenses…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No expenses yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className={css.num}>Amount</th>
                <th>Paid Via</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(expense => (
                <tr key={expense.id}>
                  <td>{shortDate(expense.date)}</td>
                  <td>{expense.description}</td>
                  <td>{expense.category}</td>
                  <td className={css.num}>{formatNaira(expense.amount)}</td>
                  <td>{methodLabel(expense.paymentMethod)}</td>
                  <td>{expense.status}</td>
                  <td>
                    {expense.status === 'PENDING' && expense.paymentMethod === 'REIMBURSEMENT' && (
                      <button
                        type="button"
                        className={`${css.button} ${css.primary}`}
                        disabled={approving !== null}
                        onClick={() => { void approve(expense) }}
                      >
                        {approving === expense.id ? 'Approving…' : 'Approve'}
                      </button>
                    )}
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
            aria-labelledby="new-expense-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-expense-title" className={css.modalTitle}>New Expense</h2>
            <div className={css.modalBody}>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Description</span>
                  <input
                    className={css.input}
                    value={description}
                    onChange={(event) => { setDescription(event.target.value) }}
                    placeholder="e.g. Fuel top-up"
                    autoFocus
                  />
                </label>
                <label className={css.field}>
                  <span className={css.label}>Date</span>
                  <input
                    className={css.input}
                    type="date"
                    value={date}
                    onChange={(event) => { setDate(event.target.value) }}
                  />
                </label>
              </div>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Amount</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => { setAmount(event.target.value) }}
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Category</span>
                  <select
                    className={css.select}
                    value={categoryId}
                    onChange={(event) => { setCategoryId(event.target.value) }}
                  >
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Paid via</span>
                  <select
                    className={css.select}
                    value={paymentMethod}
                    onChange={(event) => {
                      setPaymentMethod(event.target.value as 'CASH' | 'BANK' | 'REIMBURSEMENT')
                    }}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                    <option value="REIMBURSEMENT">Reimbursement</option>
                  </select>
                </label>
              </div>
              {paymentMethod === 'REIMBURSEMENT' && (
                <label className={css.field}>
                  <span className={css.label}>Employee</span>
                  <select
                    className={css.select}
                    value={employeeId}
                    onChange={(event) => { setEmployeeId(event.target.value) }}
                  >
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>{employee.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || description.trim() === '' || amount.trim() === ''}
              >
                {saving ? 'Saving…' : 'Record expense'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Expense-category list plus a create dialog. */
export function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadExpenseCategories()
      .then(setCategories)
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
      const created = await createExpenseCategory({ name: name.trim() })
      setNotice(`Category ${created.name} added.`)
      setName('')
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const rows = categories ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Expense Categories</h1>
          <p className={css.subtitle}>Group expenses for reporting and journals.</p>
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
            New Category
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {loading && categories === null ? (
          <div className={css.empty}>Loading categories…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No categories yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(category => (
                <tr key={category.id}>
                  <td>{category.name}</td>
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
            aria-labelledby="new-category-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-category-title" className={css.modalTitle}>New Category</h2>
            <div className={css.modalBody}>
              <label className={css.field}>
                <span className={css.label}>Name</span>
                <input
                  className={css.input}
                  value={name}
                  onChange={(event) => { setName(event.target.value) }}
                  placeholder="e.g. Training"
                  autoFocus
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
                {saving ? 'Creating…' : 'Create category'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
