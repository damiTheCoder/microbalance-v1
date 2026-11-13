import { Prisma } from '@prisma/client';
import { LedgerError } from './errors.js';

/** Convert any Decimal-able input to a Prisma.Decimal, defaulting to zero. */
export function toDecimal(
  value: Prisma.Decimal.Value | null | undefined,
  label: string,
): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  try {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    throw new LedgerError('VALIDATION', `Invalid ${label}: ${String(value)}`);
  }
}

/** Money values are stored with at most 2 decimal places. */
export function assertPrecision(value: Prisma.Decimal, label: string): void {
  if (!value.equals(value.toDecimalPlaces(2))) {
    throw new LedgerError('VALIDATION', `${label} must have at most 2 decimal places`);
  }
}

export function assertNonNegative(value: Prisma.Decimal, label: string): void {
  if (value.isNegative()) {
    throw new LedgerError('VALIDATION', `${label} must not be negative`);
  }
}

/** Stable string representation for API responses (never floats). */
export function money(value: Prisma.Decimal.Value): string {
  return toDecimal(value, 'amount').toFixed(2);
}
