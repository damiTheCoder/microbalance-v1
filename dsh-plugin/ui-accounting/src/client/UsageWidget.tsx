/** Month-to-date AI token usage and estimated cost for the dashboard. */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { CORE_URL } from './core.ts'
import css from './dashboard.module.css'

interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  costUsd: number
  limitUsd: number
  usedRatio: number
  month: string
}

const compact = (value: number): string =>
  Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

/** Small dashboard card: tokens, estimated USD cost, and the monthly ratio. */
export function UsageWidget(): JSX.Element | null {
  const [usage, setUsage] = useState<UsageTotals | null>(null)

  useEffect(() => {
    let alive = true
    void fetch(`${CORE_URL}/api/usage/tokens`, { credentials: 'include' })
      .then(async response => (response.ok ? await response.json() as { data: UsageTotals } : null))
      .then((body) => { if (alive && body !== null) setUsage(body.data) })
      .catch(() => { /* core offline: leave the card hidden */ })
    return () => { alive = false }
  }, [])

  if (usage === null) return null
  const percent = Math.round(usage.usedRatio * 100)

  return (
    <section className={css.usageCard} aria-label="AI usage and costs">
      <header className={css.usageHead}>
        <div>
          <h2 className={css.chartTitle}>AI Usage &amp; Costs</h2>
          <p className={css.chartSub}>Month to date · {usage.month}</p>
        </div>
        <span className={css.usageCost}>${usage.costUsd.toFixed(2)}</span>
      </header>
      <div className={css.usageGrid}>
        <div className={css.usageStat}>
          <span className={css.usageLabel}>Input Tokens</span>
          <span className={css.usageValue}>{compact(usage.inputTokens)}</span>
        </div>
        <div className={css.usageStat}>
          <span className={css.usageLabel}>Output Tokens</span>
          <span className={css.usageValue}>{compact(usage.outputTokens)}</span>
        </div>
        <div className={css.usageStat}>
          <span className={css.usageLabel}>Cached Tokens</span>
          <span className={css.usageValue}>{compact(usage.cachedTokens)}</span>
        </div>
      </div>
      <div
        className={css.usageBar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Monthly AI budget used"
      >
        <span className={css.usageBarFill} style={{ width: `${percent}%` }} />
      </div>
      <p className={css.usageFoot}>
        ${usage.costUsd.toFixed(2)} of ${usage.limitUsd.toFixed(2)} monthly budget · {percent}%
      </p>
    </section>
  )
}
