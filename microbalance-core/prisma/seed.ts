import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * IFRS chart of accounts.
 *
 * Codes are stable system identifiers: assets 1000-1999, liabilities
 * 2000-2999, equity 3000-3999, revenue 4000-4999, expenses 6000-8999.
 */
const ACCOUNTS = [
  // Assets
  { code: '1000', name: 'Cash', type: 'ASSET', category: 'Current Assets', isSystem: true },
  { code: '1010', name: 'Bank', type: 'ASSET', category: 'Current Assets', isSystem: true },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', category: 'Current Assets', isSystem: true },
  { code: '1200', name: 'Inventory', type: 'ASSET', category: 'Current Assets', isSystem: true },
  { code: '1300', name: 'Prepaid Expenses', type: 'ASSET', category: 'Current Assets', isSystem: true },
  { code: '1500', name: 'Fixed Assets', type: 'ASSET', category: 'Non-current Assets', isSystem: true },
  { code: '1510', name: 'Accumulated Depreciation', type: 'ASSET', category: 'Non-current Assets', isSystem: true },

  // Liabilities
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', category: 'Current Liabilities', isSystem: true },
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY', category: 'Current Liabilities', isSystem: true },
  { code: '2110', name: 'WHT Payable', type: 'LIABILITY', category: 'Current Liabilities', isSystem: true },
  { code: '2200', name: 'Accruals', type: 'LIABILITY', category: 'Current Liabilities', isSystem: true },
  { code: '2300', name: 'Short-term Loans', type: 'LIABILITY', category: 'Current Liabilities', isSystem: true },
  { code: '2500', name: 'Long-term Loans', type: 'LIABILITY', category: 'Non-current Liabilities', isSystem: true },

  // Equity
  { code: '3000', name: 'Share Capital', type: 'EQUITY', category: 'Equity', isSystem: true },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY', category: 'Equity', isSystem: true },

  // Revenue
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE', category: 'Operating Revenue', isSystem: true },
  { code: '4100', name: 'Service Revenue', type: 'REVENUE', category: 'Operating Revenue', isSystem: true },

  // Expenses
  { code: '6000', name: 'Rent Expense', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
  { code: '6100', name: 'Salaries Expense', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
  { code: '6200', name: 'Utilities Expense', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
  { code: '6300', name: 'Depreciation Expense', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
  { code: '6400', name: 'Marketing Expense', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
  { code: '6500', name: 'Insurance Expense', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
  { code: '6600', name: 'Professional Fees', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
  { code: '6700', name: 'Bank Charges', type: 'EXPENSE', category: 'Operating Expenses', isSystem: true },
] as const;

const CUSTOMERS = [
  { name: 'Acme Corp', email: 'billing@acme.test', phone: '+1-555-0100' },
  { name: 'Jane Doe', email: 'jane@janedoe.test', phone: '+1-555-0101' },
];

const VENDORS = [
  { name: 'Northwind Traders', email: 'orders@northwind.test', phone: '+1-555-0200' },
  { name: 'Harbor Logistics', email: 'accounts@harbor.test', phone: '+1-555-0201' },
];

const ITEMS = [
  { name: 'Bread', sku: 'BRD-001', price: '1200', cost: '700', stockQuantity: 100 },
  { name: 'Coffee', sku: 'COF-001', price: '800', cost: '450', stockQuantity: 200 },
  { name: 'Cake', sku: 'CAK-001', price: '2500', cost: '1400', stockQuantity: 50 },
];

async function main(): Promise<void> {
  for (const account of ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: {
        name: account.name,
        type: account.type,
        category: account.category,
        isSystem: account.isSystem,
      },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        isSystem: account.isSystem,
        balance: new Prisma.Decimal(0),
      },
    });
  }

  for (const customer of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({ where: { name: customer.name } });
    if (!existing) await prisma.customer.create({ data: customer });
  }

  for (const vendor of VENDORS) {
    const existing = await prisma.vendor.findFirst({ where: { name: vendor.name } });
    if (!existing) await prisma.vendor.create({ data: vendor });
  }

  for (const item of ITEMS) {
    const existing = await prisma.item.findFirst({ where: { sku: item.sku } });
    if (!existing) {
      await prisma.item.create({
        data: {
          name: item.name,
          sku: item.sku,
          price: new Prisma.Decimal(item.price),
          cost: new Prisma.Decimal(item.cost),
          stockQuantity: item.stockQuantity,
        },
      });
    }
  }

  const [accounts, customers, vendors, items] = await Promise.all([
    prisma.account.count(),
    prisma.customer.count(),
    prisma.vendor.count(),
    prisma.item.count(),
  ]);

  console.log(
    `Seed complete: ${accounts} accounts, ${customers} customers, ${vendors} vendors, ${items} items.`,
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
