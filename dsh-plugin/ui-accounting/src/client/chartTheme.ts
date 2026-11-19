/** Shared shadcn-inspired chart palette and tooltip chrome. */

export const CHART_COLORS = {
  primary: '#2563EB',
  secondary: '#DBEAFE',
  accent: '#60A5FA',
  grid: 'var(--dsw-alias-border-l2)',
  text: 'var(--dsw-alias-label-tertiary)',
} as const

/** Recharts `Tooltip` content container styling. */
export const chartTooltipStyle = {
  background: 'var(--dsw-alias-bg-layer-1)',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  boxShadow: '0 12px 32px -18px rgba(17, 24, 39, 0.35)',
  fontSize: 12,
  padding: '8px 12px',
  color: 'var(--dsw-alias-label-primary)',
} as const

/** Subtle cursor shared by bars and lines. */
export const chartCursor = { fill: 'transparent' } as const

/** Muted axis tick styling. */
export const chartAxisTick = { fill: CHART_COLORS.text, fontSize: 12 } as const
