/**
 * Application-level enum re-exports.
 *
 * The canonical definitions live in `prisma/schema.prisma`; the generated
 * Prisma client exposes them as string-literal unions. Re-exporting keeps
 * engine code decoupled from the generated namespace while preserving a
 * single source of truth.
 */

export type {
  AccountType,
  JournalStatus,
  InvoiceStatus,
  BillStatus,
  BankTxnStatus,
  BankTxnType,
} from '@prisma/client';

/** ASSET and EXPENSE accounts increase with a debit. */
export function isDebitNormal(type: string): boolean {
  return type === 'ASSET' || type === 'EXPENSE';
}
