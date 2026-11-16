import { randomUUID } from 'node:crypto'
import { DEFAULT_COMPANY_ID } from './tenancy.js'
import { prisma } from './prisma.js'

/**
 * Give a brand-new organization its own ledger scaffold by cloning the demo
 * company's chart of accounts and expense categories. Runs after Better Auth
 * creates the Company row.
 */
export async function provisionCompany(companyId: string): Promise<void> {
  if (companyId === DEFAULT_COMPANY_ID) return

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({
      where: { companyId: DEFAULT_COMPANY_ID },
      orderBy: { code: 'asc' },
    }),
    prisma.expenseCategory.findMany({ where: { companyId: DEFAULT_COMPANY_ID } }),
  ])

  if (accounts.length > 0) {
    await prisma.account.createMany({
      data: accounts.map((account) => ({
        id: randomUUID(),
        companyId,
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        isSystem: account.isSystem,
        balance: 0,
      })),
    })
  }

  if (categories.length > 0) {
    await prisma.expenseCategory.createMany({
      data: categories.map((category) => ({
        id: randomUUID(),
        companyId,
        name: category.name,
      })),
    })
  }

  await prisma.businessProfile.create({
    data: { companyId },
  })
}
