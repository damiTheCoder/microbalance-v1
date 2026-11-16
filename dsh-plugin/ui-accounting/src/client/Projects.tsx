/** Projects: budgets, cost transactions and per-project profitability. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { callCore, formatNaira } from './core.ts'
import { CHART_COLORS, chartCursor, chartTooltipStyle } from './chartTheme.ts'
import css from './accounting.module.css'

interface Project {
  id: string
  name: string
  clientId: string | null
  client: string | null
  budget: string
  spent: string
  remaining: string
  revenue: string
  profit: string
  margin: number
  startDate: string
  endDate: string | null
  status: string
  transactions: number
}

interface Customer {
  id: string
  name: string
}

interface Line {
  id: string
  date: string
  description: string
  amount: string
}

interface Profitability {
  project: {
    id: string
    name: string
    client: string | null
    budget: string
    startDate: string
    endDate: string | null
    status: string
  }
  revenueLines: Line[]
  expenseLines: Line[]
  totalRevenue: string
  totalExpenses: string
  profit: string
  margin: number
  spent: string
  remaining: string
}

const today = (): string => new Date().toISOString().slice(0, 10)

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Project register with budget consumption and margin. */
export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<'project' | 'transaction' | null>(null)
  const [target, setTarget] = useState<Project | null>(null)

  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')

  const [type, setType] = useState<'REVENUE' | 'EXPENSE'>('REVENUE')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')

  const load = useCallback((): void => {
    setLoading(true)
    setError(null)
    Promise.all([
      callCore<Project[]>('GET_PROJECTS'),
      callCore<Customer[]>('GET_CUSTOMERS'),
    ])
      .then(([nextProjects, nextCustomers]) => {
        setProjects(nextProjects)
        setCustomers(nextCustomers)
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openProject = (): void => {
    setDialog('project')
    setName('')
    setClientId('')
    setBudget('')
    setStartDate(today())
    setEndDate('')
    setNotice(null)
  }

  const openTransaction = (project: Project): void => {
    setDialog('transaction')
    setTarget(project)
    setType('REVENUE')
    setDescription('')
    setAmount('')
    setStartDate(today())
    setNotice(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (dialog === 'project') {
        await callCore('CREATE_PROJECT', {
          name,
          ...(clientId === '' ? {} : { clientId }),
          budget,
          startDate,
          ...(endDate === '' ? {} : { endDate }),
        })
        setNotice(`Project ${name} created.`)
      } else if (target !== null) {
        await callCore('ADD_PROJECT_TRANSACTION', {
          projectId: target.id,
          type,
          description,
          amount,
          date: startDate,
        })
        setNotice(`${type === 'REVENUE' ? 'Revenue' : 'Expense'} added to ${target.name}.`)
      }
      setDialog(null)
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
          <h1 className={css.title}>Projects</h1>
          <p className={css.subtitle}>Budgets, costs and margins by project.</p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={load} disabled={loading}>Refresh</button>
          <button type="button" className={`${css.button} ${css.primary}`} onClick={openProject}>New Project</button>
        </div>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      <div className={css.card}>
        {projects.length === 0 ? (
          <div className={css.empty}>{loading ? 'Loading projects…' : 'No projects yet.'}</div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th className={css.num}>Budget</th>
                <th className={css.num}>Spent</th>
                <th className={css.num}>Remaining</th>
                <th className={css.num}>Margin</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map(project => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.client ?? '—'}</td>
                  <td className={css.num}>{formatNaira(project.budget)}</td>
                  <td className={css.num}>{formatNaira(project.spent)}</td>
                  <td className={css.num}>{formatNaira(project.remaining)}</td>
                  <td className={css.num}>{project.margin.toFixed(1)}%</td>
                  <td><span className={css.badge}>{project.status}</span></td>
                  <td>
                    <button
                      type="button"
                      className={css.button}
                      onClick={() => { openTransaction(project) }}
                    >
                      Add Transaction
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog !== null && (
        <div
          className={css.backdrop}
          onClick={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null) }}
        >
          <form className={css.modal} onSubmit={(event) => { void submit(event) }}>
            <h2 className={css.modalTitle}>
              {dialog === 'project' ? 'New Project' : `Add Transaction — ${target?.name ?? ''}`}
            </h2>
            <div className={css.modalBody}>
              {dialog === 'project' ? (
                <>
                  <label className={css.field}>
                    <span className={css.label}>Project name</span>
                    <input className={css.input} required value={name} onChange={(event) => { setName(event.target.value) }} placeholder="e.g. Website Redesign" />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Client</span>
                    <select className={css.select} value={clientId} onChange={(event) => { setClientId(event.target.value) }}>
                      <option value="">No client</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Budget (₦)</span>
                    <input className={css.input} type="number" min="0" step="0.01" required value={budget} onChange={(event) => { setBudget(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Start date</span>
                    <input className={css.input} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>End date (optional)</span>
                    <input className={css.input} type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value) }} />
                  </label>
                </>
              ) : (
                <>
                  <label className={css.field}>
                    <span className={css.label}>Type</span>
                    <select className={css.select} value={type} onChange={(event) => { setType(event.target.value as typeof type) }}>
                      <option value="REVENUE">Revenue</option>
                      <option value="EXPENSE">Expense</option>
                    </select>
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Description</span>
                    <input className={css.input} required value={description} onChange={(event) => { setDescription(event.target.value) }} placeholder="e.g. Design milestone" />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Amount (₦)</span>
                    <input className={css.input} type="number" min="0" step="0.01" required value={amount} onChange={(event) => { setAmount(event.target.value) }} />
                  </label>
                  <label className={css.field}>
                    <span className={css.label}>Date</span>
                    <input className={css.input} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value) }} />
                  </label>
                </>
              )}
            </div>
            <div className={css.modalActions}>
              <button type="button" className={css.button} onClick={() => { setDialog(null) }} disabled={busy}>Cancel</button>
              <button type="submit" className={`${css.button} ${css.primary}`} disabled={busy}>
                {busy ? 'Saving…' : dialog === 'project' ? 'Create project' : 'Add transaction'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/** Per-project profitability with budget versus actual spend. */
export function ProjectProfitabilityPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [report, setReport] = useState<Profitability | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback((): void => {
    callCore<Project[]>('GET_PROJECTS')
      .then((next) => {
        setProjects(next)
        setProjectId(current => current !== '' ? current : (next[0]?.id ?? ''))
      })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (projectId === '') {
      setReport(null)
      return
    }
    setLoading(true)
    setError(null)
    callCore<Profitability>('GET_PROJECT_PROFITABILITY', { projectId })
      .then(setReport)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [projectId])

  const chartData = report === null
    ? []
    : [
      { name: 'Budget', value: Number(report.project.budget) },
      { name: 'Actual Spent', value: Number(report.spent) },
    ]

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Profitability</h1>
          <p className={css.subtitle}>Revenue, costs and margin against the project budget.</p>
        </div>
        <label className={css.field}>
          <span className={css.label}>Project</span>
          <select className={css.select} value={projectId} onChange={(event) => { setProjectId(event.target.value) }}>
            {(projects.length === 0 ? [{ id: '', name: 'No projects yet' }] : projects).map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      </header>

      {error !== null && <div className={css.error}>{error}</div>}

      {loading && report === null ? (
        <div className={css.card}><div className={css.empty}>Loading project…</div></div>
      ) : report === null ? (
        <div className={css.card}><div className={css.empty}>No projects yet.</div></div>
      ) : (
        <>
          <div className={css.quadGrid}>
            <div className={css.kpi}>
              <span className={css.kpiLabel}>Revenue</span>
              <span className={css.kpiValue}>{formatNaira(report.totalRevenue)}</span>
            </div>
            <div className={css.kpi}>
              <span className={css.kpiLabel}>Expenses</span>
              <span className={css.kpiValue}>{formatNaira(report.totalExpenses)}</span>
            </div>
            <div className={css.kpi}>
              <span className={css.kpiLabel}>Profit</span>
              <span className={css.kpiValue}>{formatNaira(report.profit)}</span>
            </div>
            <div className={css.kpi}>
              <span className={css.kpiLabel}>Margin</span>
              <span className={css.kpiValue}>{report.margin.toFixed(1)}%</span>
            </div>
          </div>

          <div className={css.card}>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={value => formatNaira(Number(value))}
                    cursor={chartCursor}
                    contentStyle={chartTooltipStyle}
                  />
                  <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={css.split}>
            <div className={css.card}>
              <h2 className={css.cardHeading}>Revenue</h2>
              {report.revenueLines.length === 0 ? (
                <div className={css.empty}>No revenue yet.</div>
              ) : (
                <table className={css.table}>
                  <tbody>
                    {report.revenueLines.map(line => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td className={css.num}>{formatNaira(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className={css.card}>
              <h2 className={css.cardHeading}>Expenses</h2>
              {report.expenseLines.length === 0 ? (
                <div className={css.empty}>No expenses yet.</div>
              ) : (
                <table className={css.table}>
                  <tbody>
                    {report.expenseLines.map(line => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td className={css.num}>{formatNaira(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
