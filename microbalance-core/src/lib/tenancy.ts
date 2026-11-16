import type { PrismaClient } from '@prisma/client'
import { prisma } from './prisma.js'

/** Company used for rows created outside a request (seeds, backfills). */
export const DEFAULT_COMPANY_ID = 'default'

/** Models that carry a `companyId` column. */
const TENANT_MODELS = new Set([
  'Account',
  'JournalEntry',
  'Customer',
  'Vendor',
  'Item',
  'SalesInvoice',
  'PurchaseBill',
  'BankTransaction',
  'Employee',
  'PayrollRun',
  'FixedAsset',
  'Expense',
  'ExpenseCategory',
  'Budget',
  'BusinessProfile',
  'Document',
  'AuditLog',
  'Project',
])

const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
])

type Args = Record<string, unknown>

const scopeWhere = (where: unknown, companyId: string): unknown => ({
  ...(where as Args | undefined),
  companyId,
})

const stampData = (data: unknown, companyId: string): unknown => {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as Args), companyId }))
  }
  return { ...(data as Args | undefined), companyId }
}

/**
 * A Prisma client whose every query is confined to one company.
 *
 * Creates are stamped with `companyId`; reads, updates, and deletes are
 * filtered by it. Journal lines are scoped through their parent entry.
 * ErpService and LedgerEngine stay tenant-agnostic — they receive a scoped
 * client per request.
 */
export function companyPrisma(companyId: string): PrismaClient {
  return prisma.$extends({
    name: 'company-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = args as Args

          if (TENANT_MODELS.has(model)) {
            if (operation === 'create') {
              a.data = stampData(a.data, companyId)
            } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
              a.data = stampData(a.data, companyId)
            } else if (operation === 'upsert') {
              a.where = scopeWhere(a.where, companyId)
              a.create = stampData(a.create, companyId)
            } else if (WHERE_OPS.has(operation)) {
              a.where = scopeWhere(a.where, companyId)
            }
          } else if (model === 'JournalLine' && WHERE_OPS.has(operation)) {
            const where = (a.where ?? {}) as Args
            const parent = (where.journalEntry ?? {}) as Args
            a.where = { ...where, journalEntry: { ...parent, companyId } }
          }

          return query(a as never)
        },
      },
    },
  }) as unknown as PrismaClient
}
