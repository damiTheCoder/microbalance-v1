/**
 * Backfill: create the default company and stamp every existing row with its id.
 * Safe to run repeatedly (only touches rows where companyId is null).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const COMPANY_ID = 'default'
const COMPANY_NAME = 'MicroBalance Demo'

const MODELS = [
  'account',
  'journalEntry',
  'customer',
  'vendor',
  'item',
  'salesInvoice',
  'purchaseBill',
  'bankTransaction',
  'employee',
  'payrollRun',
  'fixedAsset',
  'expense',
  'expenseCategory',
  'budget',
  'businessProfile',
] as const

async function main(): Promise<void> {
  const company = await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: { id: COMPANY_ID, name: COMPANY_NAME },
  })
  console.log(`company ${company.id} (${company.name})`)

  for (const model of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model]
    const result = await delegate.updateMany({
      where: { companyId: null },
      data: { companyId: company.id },
    })
    console.log(`${model}: backfilled ${result.count}`)
  }

  let nulls = 0
  for (const model of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model]
    const count = await delegate.count({ where: { companyId: null } })
    if (count > 0) {
      console.error(`${model}: ${count} rows still have null companyId`)
      nulls += count
    }
  }
  console.log(nulls === 0 ? 'OK: zero null companyId rows' : `FAILED: ${nulls} null rows`)
  if (nulls > 0) process.exitCode = 1
}

main()
  .catch((cause: unknown) => {
    console.error(cause)
    process.exitCode = 1
  })
  .finally(() => { void prisma.$disconnect() })
