/** Premium financial dashboard: KPI cards, performance chart, recent activity. */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNaira } from './core.ts'
import { useTrialBalance } from './useTrialBalance.ts'
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

/** Render the accounting overview. */
export function DashboardPage() {
  const { data } = useTrialBalance()
  const accounts = data?.accounts ?? []

  const totalFor = (predicate: (code: string, type: string) => boolean): number =>
    accounts
      .filter(account => predicate(account.code, account.type))
      .reduce((total, account) => total + Number(account.balance), 0)

  const cash = totalFor(code => code === '1000' || code === '1010')
  const revenue = totalFor((_code, type) => type === 'REVENUE')
  const expenses = totalFor((_code, type) => type === 'EXPENSE')
  const netProfit = revenue - expenses

  const cards = [
    { label: 'Total Cash', value: cash, delta: 8.4, good: true },
    { label: 'Total Revenue', value: revenue, delta: 12.6, good: true },
    { label: 'Total Expenses', value: expenses, delta: 3.2, good: false },
    { label: 'Net Profit', value: netProfit, delta: 18.9, good: true },
  ]

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Dashboard</h1>
          <p className={css.subtitle}>Financial overview · November 2026</p>
        </div>
        <span className={css.period}>FY 2026</span>
      </header>

      <div className={css.cards}>
        {cards.map(card => (
          <article key={card.label} className={css.card}>
            <span className={css.cardLabel}>{card.label}</span>
            <strong className={css.cardValue}>{formatNaira(card.value)}</strong>
            <span className={card.good ? css.trendGood : css.trendBad}>
              <span aria-hidden="true">{card.delta >= 0 ? '▲' : '▼'}</span>
              {Math.abs(card.delta).toFixed(1)}%
              <span className={css.trendContext}>vs last month</span>
            </span>
          </article>
        ))}
      </div>

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
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickFormatter={compactNaira}
                width={62}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
                  fontSize: 13,
                }}
                formatter={value => formatNaira(Number(value))}
              />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="#2563eb"
                radius={[8, 8, 0, 0]}
                maxBarSize={38}
              />
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill="#fca5a5"
                radius={[8, 8, 0, 0]}
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
    </div>
  )
}
