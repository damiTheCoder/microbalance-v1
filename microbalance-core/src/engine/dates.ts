import { LedgerError } from './errors.js';

/** Parse an optional date input, falling back to `fallback` (or now). */
export function parseDate(
  value: string | Date | null | undefined,
  label: string,
  fallback: Date = new Date(),
): Date {
  if (value === null || value === undefined || value === '') return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new LedgerError('VALIDATION', `Invalid ${label}`);
  }
  return date;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export const MS_PER_DAY = 86_400_000;

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / MS_PER_DAY);
}
