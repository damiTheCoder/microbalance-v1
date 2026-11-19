/** Premium financial dashboard: command bar, performance chart, recent activity. */
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Globe, Store } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNaira, loadBusinessName } from './core.ts'
import brandMark from './assets/MM1.png'
import { CHART_COLORS, chartAxisTick, chartCursor, chartTooltipStyle } from './chartTheme.ts'
import { useTrialBalance } from './useTrialBalance.ts'
import { UsageWidget } from './UsageWidget.tsx'
import css from './dashboard.module.css'

interface PerformancePoint {
  month: string
  revenue: number
  expenses: number
}

/** Sample six-month series; replaced by posted history when the engine exposes it. */
const PERFORMANCE: PerformancePoint[] = [
  { month: 'Jun', revenue: 420_000, expenses: 250_000 },
  { month: 'Jul', revenue: 510_000, expenses: 292_000 },
  { month: 'Aug', revenue: 465_000, expenses: 281_000 },
  { month: 'Sep', revenue: 620_000, expenses: 338_000 },
  { month: 'Oct', revenue: 585_000, expenses: 314_000 },
  { month: 'Nov', revenue: 710_000, expenses: 372_000 },
]

interface Activity {
  account: string
  memo: string
  amount: number
  status: 'PENDING' | 'POSTED'
}

/** Sample recent entries until the engine exposes a journal list intent. */
const ACTIVITY: Activity[] = [
  {
    account: 'Sales Revenue',
    memo: 'Invoice INV-0042 · Acme Corp',
    amount: 1_250_000,
    status: 'POSTED',
  },
  {
    account: 'Rent Expense',
    memo: 'November office rent',
    amount: 450_000,
    status: 'POSTED',
  },
  {
    account: 'Accounts Receivable',
    memo: 'Invoice INV-0043 · Jane Doe',
    amount: 320_000,
    status: 'PENDING',
  },
  {
    account: 'Salaries Expense',
    memo: 'October payroll',
    amount: 980_000,
    status: 'POSTED',
  },
  {
    account: 'VAT Payable',
    memo: 'October VAT accrual',
    amount: 84_500,
    status: 'PENDING',
  },
]

const compactNaira = (value: number): string => {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `₦${Math.round(value / 1_000)}k`
  return `₦${value}`
}

/** Headline naira figure: compact millions, full amount otherwise. */
const nairaText = (value: number): string => {
  const sign = value < 0 ? '-' : ''
  const amount = Math.abs(value)
  if (amount >= 1_000_000) return `${sign}₦${(amount / 1_000_000).toFixed(1)}M`
  return `${sign}₦${Math.round(amount).toLocaleString('en-NG')}`
}

/** Render the accounting overview. */
export function DashboardPage() {
  const { data } = useTrialBalance()
  const accounts = data?.accounts ?? []
  const [activeMetric, setActiveMetric] = useState('revenue')
  const [menuOpen, setMenuOpen] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const barRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let alive = true
    loadBusinessName()
      .then((profile) => { if (alive && profile.name) setBusinessName(profile.name) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setMenuOpen(false)
        return
      }
      if (barRef.current !== null && !barRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const totalFor = (predicate: (code: string, type: string) => boolean): number =>
    accounts
      .filter(account => predicate(account.code, account.type))
      .reduce((total, account) => total + Number(account.balance), 0)

  const cash = totalFor(code => code === '1000' || code === '1010')
  const revenue = totalFor((_code, type) => type === 'REVENUE')
  const expenses = totalFor((_code, type) => type === 'EXPENSE')
  const netProfit = revenue - expenses

  const metrics = [
    { key: 'cash', label: 'Total Cash', value: cash, delta: 8.4, good: true },
    { key: 'revenue', label: 'Total Revenue', value: revenue, delta: 12.6, good: true },
    { key: 'expenses', label: 'Total Expenses', value: expenses, delta: 3.2, good: false },
    { key: 'profit', label: 'Net Profit', value: netProfit, delta: 18.9, good: true },
  ]
  const fallback = { key: 'revenue', label: 'Total Revenue', value: revenue, delta: 12.6, good: true }
  const active = metrics.find(metric => metric.key === activeMetric) ?? fallback
  const others = metrics.filter(metric => metric.key !== active.key)

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Dashboard</h1>
          <p className={css.subtitle}>Financial overview · November 2026</p>
        </div>
        <span className={css.period}>FY 2026</span>
      </header>

      <section className={css.kpiCard} ref={barRef}>
        <div className={css.kpiIcon}>
          <img src={brandMark} alt="" className={css.kpiIconImage} />
        </div>
        <div className={css.kpiBody}>
          <div className={css.kpiHead}>
            <div>
              <h2 className={css.kpiTitle}>{businessName || 'Your business'}</h2>
              <div className={css.kpiSub}>
                <span className={css.kpiDropWrap}>
                  <button
                    type="button"
                    className={css.kpiDrop}
                    onClick={() => setMenuOpen(open => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={menuOpen}
                  >
                    View more balances
                    <span aria-hidden="true">▾</span>
                  </button>
                  {menuOpen && (
                    <ul className={css.kpiMenu} role="listbox" aria-label="Metrics">
                      {others.map(metric => (
                        <li key={metric.key}>
                          <button
                            type="button"
                            role="option"
                            aria-selected="false"
                            className={css.kpiMenuItem}
                            onClick={() => {
                              setActiveMetric(metric.key)
                              setMenuOpen(false)
                            }}
                          >
                            <span>{metric.label}</span>
                            <span className={metric.delta >= 0 ? css.kpiMiniGood : css.kpiMiniBad}>
                              {nairaText(metric.value)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
                <button type="button" className={css.kpiGhost} title="View public site" aria-label="View public site">
                  <Globe size={14} />
                </button>
                <button type="button" className={css.kpiGhost} title="Open storefront" aria-label="Open storefront">
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          </div>
          <div className={css.kpiMetricRow}>
            <span className={css.kpiMetricLabel}>{active.label}</span>
            <button type="button" className={css.kpiGhost} title="Public view" aria-label="Public view">
              <Globe size={13} />
            </button>
            <button type="button" className={css.kpiGhost} title="Store view" aria-label="Store view">
              <Store size={13} />
            </button>
          </div>
          <div className={css.kpiValueRow}>
            <strong className={css.kpiValue}>{nairaText(active.value)}</strong>
            <span className={`${css.kpiPill} ${active.delta >= 0 ? css.kpiPillGood : css.kpiPillBad}`}>
              {active.delta >= 0 ? '+' : ''}
              {active.delta.toFixed(0)}%
            </span>
          </div>
        </div>
      </section>

      <section className={css.chartCard}>
        <header className={css.chartHeader}>
          <div>
            <h2 className={css.chartTitle}>Cash Flow / Financial Performance</h2>
            <p className={css.chartSub}>Revenue vs expenses · last 6 months</p>
          </div>
          <div className={css.legendKeys}>
            <span className={css.legendKey}>
              <span className={css.dotRevenue} /> Revenue
            </span>
            <span className={css.legendKey}>
              <span className={css.dotExpenses} /> Expenses
            </span>
          </div>
        </header>
        <div className={css.chartWrap}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={PERFORMANCE} barGap={10} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={chartAxisTick}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={chartAxisTick}
                tickFormatter={compactNaira}
                width={62}
              />
              <Tooltip
                cursor={chartCursor}
                contentStyle={chartTooltipStyle}
                formatter={value => formatNaira(Number(value))}
              />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={CHART_COLORS.primary}
                radius={[6, 6, 0, 0]}
                maxBarSize={38}
              />
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill={CHART_COLORS.secondary}
                radius={[6, 6, 0, 0]}
                maxBarSize={38}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={css.activityCard}>
        <header className={css.activityHeader}>
          <div>
            <h2 className={css.chartTitle}>Recent Activity</h2>
            <p className={css.chartSub}>Latest journal entries</p>
          </div>
          <span className={css.activityCount}>{ACTIVITY.length} entries</span>
        </header>
        <ul className={css.activityList}>
          {ACTIVITY.map(entry => (
            <li key={`${entry.account}-${entry.memo}`} className={css.activityRow}>
              <span className={css.activityIcon} aria-hidden="true">
                {entry.account.charAt(0)}
              </span>
              <span className={css.activityBody}>
                <span className={css.activityName}>{entry.account}</span>
                <span className={css.activityMeta}>{entry.memo}</span>
              </span>
              <span className={css.activityAmount}>{formatNaira(entry.amount)}</span>
              <span
                className={
                  entry.status === 'POSTED'
                    ? `${css.pill} ${css.pillPosted}`
                    : `${css.pill} ${css.pillPending}`
                }
              >
                {entry.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <UsageWidget />
    </div>
  )
}
