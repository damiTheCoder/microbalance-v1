/** Payroll: employee records and monthly payroll runs. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createEmployee,
  formatNaira,
  loadEmployees,
  loadPayrollHistory,
  runPayroll,
  type Employee,
  type PayrollRun,
} from './core.ts'
import css from './accounting.module.css'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const monthLabel = (month: string): string =>
  MONTHS[Number(month) - 1] ?? month

/** Employee list plus a create dialog backed by CREATE_EMPLOYEE. */
export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [basic, setBasic] = useState('')
  const [housing, setHousing] = useState('')
  const [transport, setTransport] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadEmployees()
      .then(setEmployees)
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
      const created = await createEmployee({
        name: name.trim(),
        email: email.trim(),
        basicSalary: basic.trim(),
        housingAllowance: housing.trim() === '' ? '0' : housing.trim(),
        transportAllowance: transport.trim() === '' ? '0' : transport.trim(),
        isActive: active,
      })
      setNotice(`Employee ${created.name} added.`)
      setName('')
      setEmail('')
      setBasic('')
      setHousing('')
      setTransport('')
      setActive(true)
      setModalOpen(false)
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  const rows = employees ?? []

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Employees</h1>
          <p className={css.subtitle}>Salary structure for the monthly payroll run.</p>
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
            New Employee
          </button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>Could not load employees: {error}</div>}

      <div className={css.card}>
        {loading && employees === null ? (
          <div className={css.empty}>Loading employees…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No employees yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th className={css.num}>Basic</th>
                <th className={css.num}>Allowances</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(employee => (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td className={css.num}>{formatNaira(employee.basicSalary)}</td>
                  <td className={css.num}>
                    {formatNaira(
                      Number(employee.housingAllowance) + Number(employee.transportAllowance),
                    )}
                  </td>
                  <td>{employee.isActive ? 'Active' : 'Inactive'}</td>
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
            aria-labelledby="new-employee-title"
            onSubmit={(event) => { void submit(event) }}
          >
            <h2 id="new-employee-title" className={css.modalTitle}>New Employee</h2>
            <div className={css.modalBody}>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Name</span>
                  <input
                    className={css.input}
                    value={name}
                    onChange={(event) => { setName(event.target.value) }}
                    placeholder="e.g. Ada Okafor"
                    autoFocus
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Email</span>
                  <input
                    className={css.input}
                    type="email"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value) }}
                  />
                </label>
              </div>
              <div className={css.formRow}>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Basic salary</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={basic}
                    onChange={(event) => { setBasic(event.target.value) }}
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Housing</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={housing}
                    onChange={(event) => { setHousing(event.target.value) }}
                  />
                </label>
                <label className={`${css.field} ${css.grow}`}>
                  <span className={css.label}>Transport</span>
                  <input
                    className={css.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={transport}
                    onChange={(event) => { setTransport(event.target.value) }}
                  />
                </label>
              </div>
              <label className={css.field}>
                <span className={css.label}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => { setActive(event.target.checked) }}
                  />{' '}
                  Active
                </span>
              </label>
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={`${css.button} ${css.primary}`}
                disabled={saving || name.trim() === '' || basic.trim() === ''}
              >
                {saving ? 'Creating…' : 'Create employee'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Monthly payroll run plus the history table. */
export function PayrollPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [runs, setRuns] = useState<PayrollRun[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadPayrollHistory()
      .then(setRuns)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const submit = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    setError(null)
    setNotice(null)
    try {
      const result = await runPayroll(month, year)
      setNotice(
        `Payroll ${monthLabel(result.run.month)} ${result.run.year} · gross ${formatNaira(result.run.totalGross)} · journal ${result.journal.status}.`,
      )
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setRunning(false)
    }
  }

  const rows = runs ?? []
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Run Payroll</h1>
          <p className={css.subtitle}>
            PAYE, pension (8%), and NHF (2.5%) are calculated automatically.
          </p>
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
          disabled={running}
        >
          {running ? 'Running…' : 'Run Payroll'}
        </button>
      </div>

      <div className={css.card}>
        {loading && runs === null ? (
          <div className={css.empty}>Loading payroll history…</div>
        ) : rows.length === 0 ? (
          <div className={css.empty}>No payroll runs yet.</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th className={css.num}>Total Gross</th>
                <th className={css.num}>Total Tax (PAYE)</th>
                <th className={css.num}>Total Net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(run => (
                <tr key={run.id}>
                  <td>{monthLabel(run.month)} {run.year}</td>
                  <td className={css.num}>{formatNaira(run.totalGross)}</td>
                  <td className={css.num}>{formatNaira(run.totalPaye)}</td>
                  <td className={css.num}>{formatNaira(run.totalNet)}</td>
                  <td>{run.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
