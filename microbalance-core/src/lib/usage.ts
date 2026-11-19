/** In-process monthly AI usage ledger (tokens reported by the DSH chat). */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

/** Standard DeepSeek pricing per million tokens (USD). */
export const PRICE_PER_MTOK = { input: 0.14, output: 0.28, cached: 0.014 } as const;

/** Monthly allowance used by the dashboard progress bar. */
export const MONTHLY_LIMIT_USD = 5;

const ledger = new Map<string, UsageTotals>();
const monthKey = (): string => new Date().toISOString().slice(0, 7);

/** Add one reported turn to the company's current-month totals. */
export function recordUsage(companyId: string, delta: UsageTotals): void {
  const key = `${companyId}:${monthKey()}`;
  const current = ledger.get(key) ?? { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  ledger.set(key, {
    inputTokens: current.inputTokens + Math.max(0, delta.inputTokens),
    outputTokens: current.outputTokens + Math.max(0, delta.outputTokens),
    cachedTokens: current.cachedTokens + Math.max(0, delta.cachedTokens),
  });
}

/** Cost of one month's totals in USD, rounded to cents. */
export function usageCostUsd(totals: UsageTotals): number {
  const cost = (totals.inputTokens * PRICE_PER_MTOK.input
    + totals.outputTokens * PRICE_PER_MTOK.output
    + totals.cachedTokens * PRICE_PER_MTOK.cached) / 1_000_000;
  return Math.round(cost * 100) / 100;
}

/** Current-month totals plus cost and limit ratio for the company. */
export function monthlyUsage(companyId: string): UsageTotals & {
  month: string; costUsd: number; limitUsd: number; usedRatio: number;
} {
  const totals = ledger.get(`${companyId}:${monthKey()}`)
    ?? { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  const costUsd = usageCostUsd(totals);
  return {
    month: monthKey(),
    ...totals,
    costUsd,
    limitUsd: MONTHLY_LIMIT_USD,
    usedRatio: Math.min(1, costUsd / MONTHLY_LIMIT_USD),
  };
}
