/** Shared shadcn-inspired chart palette and tooltip chrome. */

export const CHART_COLORS = {
  primary: '#2563EB',
  secondary: '#DBEAFE',
  accent: '#60A5FA',
  grid: '#F1F5F9',
  text: '#6B7280',
} as const

/** Recharts `Tooltip` content container styling. */
export const chartTooltipStyle = {
  background: '#ffffff',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  boxShadow: '0 12px 32px -18px rgba(17, 24, 39, 0.35)',
  fontSize: 12,
  padding: '8px 12px',
} as const

/** Subtle cursor shared by bars and lines. */
export const chartCursor = { fill: 'transparent' } as const

/** Muted axis tick styling. */
export const chartAxisTick = { fill: CHART_COLORS.text, fontSize: 12 } as const
