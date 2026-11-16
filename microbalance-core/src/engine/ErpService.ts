import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { LedgerError } from './errors.js';
import { assertPrecision, money, toDecimal } from './money.js';
import { addDays, daysBetween, parseDate } from './dates.js';
import { LedgerEngine, ledgerFor } from './LedgerEngine.js';
import { companyPrisma } from '../lib/tenancy.js';

export interface InvoiceItemInput {
  itemId?: string;
  description?: string;
  quantity: Prisma.Decimal.Value;
  unitPrice?: Prisma.Decimal.Value;
}

export interface BillItemInput {
  description: string;
  quantity: Prisma.Decimal.Value;
  unitCost: Prisma.Decimal.Value;
}

export interface CreateInvoiceInput {
  customerId: string;
  date: string | Date;
  dueDate?: string | Date;
  items: InvoiceItemInput[];
}

export interface CreateBillInput {
  vendorId: string;
  date: string | Date;
  dueDate?: string | Date;
  items: BillItemInput[];
  whtRate?: Prisma.Decimal.Value;
}

export type MatchedType = 'INVOICE' | 'BILL';

export type AgingBucketKey = 'current' | '1-30' | '31-60' | '61-90' | '90+';

const AGING_BUCKETS: Array<{ key: AgingBucketKey; label: string }> = [
  { key: 'current', label: 'Current' },
  { key: '1-30', label: '1-30 days' },
  { key: '31-60', label: '31-60 days' },
  { key: '61-90', label: '61-90 days' },
  { key: '90+', label: '90+ days' },
];

function bucketFor(daysPastDue: number): AgingBucketKey {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '1-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  return '90+';
}

interface NormalizedInvoiceLine {
  itemId: string | null;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  total: Prisma.Decimal;
}

interface NormalizedBillLine {
  description: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  total: Prisma.Decimal;
}

/**
 * Operational ERP layer that turns business documents into journal proposals.
 *
 * Every method calls LedgerEngine.proposeJournal; nothing here ever posts to
 * the ledger directly. Human (or agent) approval happens via postJournal.
 */
export class ErpService {
  constructor(
    private readonly ledger: LedgerEngine = new LedgerEngine(),
    private readonly db: PrismaClient = prisma,
  ) {}

  // ---------------------------------------------------------------------------
  // Sales
  // ---------------------------------------------------------------------------

  async getCustomers() {
    return this.db.customer.findMany({ orderBy: { name: 'asc' } });
  }

  async createCustomer(input: { name: string; email?: string; phone?: string }) {
    const name = input.name.trim();
    if (name === '') {
      throw new LedgerError('VALIDATION', 'Customer name is required');
    }
    return this.db.customer.create({
      data: {
        name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
      },
    });
  }

  /** Cash and bank accounts available for payment receipt. */
  async getBankAccounts() {
    return this.db.account.findMany({
      where: {
        type: 'ASSET',
        OR: [{ name: { contains: 'Bank' } }, { name: { contains: 'Cash' } }],
      },
      orderBy: { code: 'asc' },
    });
  }

  /** Every sales invoice with its customer and outstanding balance. */
  async getInvoices() {
    const invoices = await this.db.salesInvoice.findMany({
      include: { customer: true },
      orderBy: { date: 'desc' },
    });

    return invoices.map((invoice) => {
      const outstanding = new Prisma.Decimal(invoice.totalAmount).minus(invoice.amountPaid);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customer: invoice.customer.name,
        date: invoice.date.toISOString(),
        dueDate: invoice.dueDate.toISOString(),
        status: invoice.status,
        total: money(invoice.totalAmount),
        amountPaid: money(invoice.amountPaid),
        outstanding: money(outstanding),
      };
    });
  }

  async createInvoice(input: CreateInvoiceInput) {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new LedgerError('VALIDATION', 'Invoice must contain at least one line item');
    }

    const date = parseDate(input.date, 'invoice date');
    const dueDate = input.dueDate
      ? parseDate(input.dueDate, 'invoice due date', addDays(date, 30))
      : addDays(date, 30);

    return this.db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) {
        throw new LedgerError('NOT_FOUND', `Customer ${input.customerId} not found`);
      }

      const lines = await this.buildInvoiceLines(tx, input.items);
      const subtotal = lines.reduce(
        (sum, line) => sum.plus(line.total),
        new Prisma.Decimal(0),
      );
      if (subtotal.lte(0)) {
        throw new LedgerError('VALIDATION', 'Invoice total must be greater than zero');
      }
      // Nigerian VAT is 7.5%, charged on the invoice subtotal.
      const vat = subtotal.times('0.075').toDecimalPlaces(2);
      const total = subtotal.plus(vat);

      const receivable = await this.requireAccount(tx, 'Accounts Receivable', 'ASSET');
      const revenue = await this.requireAccount(tx, 'Sales Revenue', 'REVENUE');
      const vatPayable = vat.gt(0)
        ? await this.requireAccount(tx, 'VAT Payable', 'LIABILITY')
        : undefined;

      const existingCount = await tx.salesInvoice.count();
      const invoiceNumber = `INV-${String(existingCount + 1).padStart(4, '0')}`;

      const invoice = await tx.salesInvoice.create({
        data: {
          customerId: customer.id,
          invoiceNumber,
          date,
          dueDate,
          status: 'DRAFT',
          totalAmount: total,
          amountPaid: new Prisma.Decimal(0),
          lines: {
            create: lines.map((line) => ({
              itemId: line.itemId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              total: line.total,
            })),
          },
        },
        include: { lines: true, customer: true },
      });

      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Invoice ${invoiceNumber} - ${customer.name}`,
          lines: [
            { accountId: receivable.id, debit: total },
            { accountId: revenue.id, credit: subtotal },
            ...(vatPayable !== undefined ? [{ accountId: vatPayable.id, credit: vat }] : []),
          ],
        },
        tx,
      );

      // Item-linked lines consume stock and move cost from Inventory to COGS.
      let cogsTotal = new Prisma.Decimal(0);
      for (const line of input.items) {
        if (!line.itemId) continue;
        const item = await tx.item.findUnique({ where: { id: line.itemId } });
        if (!item) continue;
        const quantity = toDecimal(line.quantity, 'invoice quantity');
        const units = Math.max(0, Math.round(quantity.toNumber()));
        if (units > 0) {
          await tx.item.update({
            where: { id: item.id },
            data: { stockQuantity: { decrement: units } },
          });
        }
        cogsTotal = cogsTotal.plus(new Prisma.Decimal(item.cost).times(quantity));
      }

      let cogsJournal: Awaited<ReturnType<LedgerEngine['proposeJournal']>> | undefined;
      if (cogsTotal.gt(0)) {
        const cogs = await this.requireAccount(tx, 'Cost of Goods Sold', 'EXPENSE');
        const inventory = await this.requireAccount(tx, 'Inventory', 'ASSET');
        cogsJournal = await this.ledger.proposeJournal(
          {
            date,
            memo: `COGS for invoice ${invoiceNumber}`,
            lines: [
              { accountId: cogs.id, debit: cogsTotal },
              { accountId: inventory.id, credit: cogsTotal },
            ],
          },
          tx,
        );
      }

      return { invoice, journal, cogsJournal };
    });
  }

  async recordInvoicePayment(
    invoiceId: string,
    amount: Prisma.Decimal.Value,
    bankAccountId: string,
    dateInput?: string | Date,
  ) {
    const payment = toDecimal(amount, 'payment amount');
    assertPrecision(payment, 'Payment amount');
    if (payment.lte(0)) {
      throw new LedgerError('VALIDATION', 'Payment amount must be greater than zero');
    }

    const date = parseDate(dateInput, 'payment date');

    return this.db.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        throw new LedgerError('NOT_FOUND', `Invoice ${invoiceId} not found`);
      }
      if (invoice.status === 'PAID') {
        throw new LedgerError('STATE', `Invoice ${invoice.invoiceNumber} is already paid`);
      }

      const outstanding = new Prisma.Decimal(invoice.totalAmount).minus(invoice.amountPaid);
      if (outstanding.lte(0)) {
        throw new LedgerError('STATE', `Invoice ${invoice.invoiceNumber} has no outstanding balance`);
      }
      if (payment.gt(outstanding)) {
        throw new LedgerError(
          'VALIDATION',
          `Payment ${money(payment)} exceeds outstanding balance ${money(outstanding)}`,
        );
      }

      const bankAccount = await tx.account.findUnique({ where: { id: bankAccountId } });
      if (!bankAccount) {
        throw new LedgerError('NOT_FOUND', `Account ${bankAccountId} not found`);
      }
      if (bankAccount.type !== 'ASSET') {
        throw new LedgerError('VALIDATION', 'Bank account must be an ASSET account');
      }

      const receivable = await this.requireAccount(tx, 'Accounts Receivable', 'ASSET');

      const newAmountPaid = new Prisma.Decimal(invoice.amountPaid).plus(payment);
      const fullyPaid = newAmountPaid.equals(invoice.totalAmount);

      const updated = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          status: fullyPaid ? 'PAID' : 'SENT',
        },
      });

      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Payment for invoice ${invoice.invoiceNumber}`,
          lines: [
            { accountId: bankAccount.id, debit: payment },
            { accountId: receivable.id, credit: payment },
          ],
        },
        tx,
      );

      return { invoice: updated, journal };
    });
  }

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------

  /** All vendors, alphabetical. */
  async getVendors() {
    return this.db.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  async createVendor(input: { name: string; email?: string; phone?: string }) {
    const name = input.name.trim();
    if (name === '') {
      throw new LedgerError('VALIDATION', 'Vendor name is required');
    }
    return this.db.vendor.create({
      data: {
        name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
      },
    });
  }

  /** Every purchase bill with its vendor. */
  async getBills() {
    const bills = await this.db.purchaseBill.findMany({
      include: { vendor: true },
      orderBy: { date: 'desc' },
    });

    return bills.map((bill) => ({
      id: bill.id,
      billNumber: bill.billNumber,
      vendorId: bill.vendorId,
      vendor: bill.vendor.name,
      date: bill.date.toISOString(),
      dueDate: bill.dueDate.toISOString(),
      status: bill.status,
      total: money(bill.totalAmount),
      amountPaid: money(bill.amountPaid),
      whtRate: money(bill.whtRate),
      whtAmount: money(bill.whtAmount),
      netPayable: money(bill.netPayable),
      outstanding: money(new Prisma.Decimal(bill.netPayable).minus(bill.amountPaid)),
    }));
  }

  /** Pay a supplier bill; WHT was already withheld when the bill was raised. */
  async recordBillPayment(
    billId: string,
    amount: Prisma.Decimal.Value,
    bankAccountId: string,
    dateInput?: string | Date,
  ) {
    const payment = toDecimal(amount, 'payment amount');
    assertPrecision(payment, 'Payment amount');
    if (payment.lte(0)) {
      throw new LedgerError('VALIDATION', 'Payment amount must be greater than zero');
    }
    const date = parseDate(dateInput, 'payment date');

    return this.db.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.findUnique({ where: { id: billId } });
      if (!bill) throw new LedgerError('NOT_FOUND', `Bill ${billId} not found`);
      if (bill.status === 'PAID') {
        throw new LedgerError('STATE', `Bill ${bill.billNumber} is already paid`);
      }
      const outstanding = new Prisma.Decimal(bill.netPayable).minus(bill.amountPaid);
      if (outstanding.lte(0)) {
        throw new LedgerError('STATE', `Bill ${bill.billNumber} has no outstanding balance`);
      }
      if (payment.gt(outstanding)) {
        throw new LedgerError(
          'VALIDATION',
          `Payment ${money(payment)} exceeds outstanding balance ${money(outstanding)}`,
        );
      }

      const bank = await tx.account.findUnique({ where: { id: bankAccountId } });
      if (!bank) throw new LedgerError('NOT_FOUND', `Account ${bankAccountId} not found`);
      if (bank.type !== 'ASSET') {
        throw new LedgerError('VALIDATION', 'Bank account must be an ASSET account');
      }
      const payable = await this.requireAccount(tx, 'Accounts Payable', 'LIABILITY');

      const newAmountPaid = new Prisma.Decimal(bill.amountPaid).plus(payment);
      const fullyPaid = newAmountPaid.equals(bill.netPayable);
      const updated = await tx.purchaseBill.update({
        where: { id: bill.id },
        data: {
          amountPaid: newAmountPaid,
          status: fullyPaid ? 'PAID' : 'RECEIVED',
        },
      });

      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Payment for bill ${bill.billNumber}`,
          lines: [
            { accountId: payable.id, debit: payment },
            { accountId: bank.id, credit: payment },
          ],
        },
        tx,
      );

      return { bill: updated, journal };
    });
  }

  /** WHT withheld from vendor bills (proposed + posted). */
  async getWhtSummary() {
    const wht = await this.db.account.findFirst({ where: { name: 'WHT Payable' } });
    if (!wht) return { whtPayable: money(0) };
    const lines = await this.db.journalLine.findMany({ where: { accountId: wht.id } });
    const total = lines.reduce(
      (sum, line) => sum.plus(line.credit).minus(line.debit),
      new Prisma.Decimal(0),
    );
    return { whtPayable: money(total) };
  }

  async createBill(input: CreateBillInput) {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new LedgerError('VALIDATION', 'Bill must contain at least one line item');
    }

    const date = parseDate(input.date, 'bill date');
    const dueDate = input.dueDate
      ? parseDate(input.dueDate, 'bill due date', addDays(date, 30))
      : addDays(date, 30);

    return this.db.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
      if (!vendor) {
        throw new LedgerError('NOT_FOUND', `Vendor ${input.vendorId} not found`);
      }

      const lines = this.buildBillLines(input.items);
      const total = lines.reduce(
        (sum, line) => sum.plus(line.total),
        new Prisma.Decimal(0),
      );
      if (total.lte(0)) {
        throw new LedgerError('VALIDATION', 'Bill total must be greater than zero');
      }

      const expense = await tx.account.findFirst({ where: { name: 'Office Supplies Expense' } })
        ?? await tx.account.findFirst({ where: { type: 'EXPENSE' }, orderBy: { code: 'asc' } });
      if (!expense) {
        throw new LedgerError('NOT_FOUND', 'No expense account is configured for bills');
      }
      const payable = await this.requireAccount(tx, 'Accounts Payable', 'LIABILITY');

      const whtRate = input.whtRate === undefined
        ? new Prisma.Decimal(0)
        : toDecimal(input.whtRate, 'WHT rate');
      if (whtRate.isNegative() || whtRate.gt(100)) {
        throw new LedgerError('VALIDATION', 'WHT rate must be between 0 and 100');
      }
      const whtAmount = total.times(whtRate).div(100).toDecimalPlaces(2);
      const netPayable = total.minus(whtAmount);
      const whtPayable = whtAmount.gt(0)
        ? await this.requireAccount(tx, 'WHT Payable', 'LIABILITY')
        : undefined;

      const existingCount = await tx.purchaseBill.count();
      const billNumber = `BILL-${String(existingCount + 1).padStart(4, '0')}`;

      const bill = await tx.purchaseBill.create({
        data: {
          vendorId: vendor.id,
          billNumber,
          date,
          dueDate,
          status: 'RECEIVED',
          totalAmount: total,
          amountPaid: new Prisma.Decimal(0),
          whtRate,
          whtAmount,
          netPayable,
          lines: {
            create: lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitCost: line.unitCost,
              total: line.total,
            })),
          },
        },
        include: { lines: true, vendor: true },
      });

      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Bill ${billNumber} - ${vendor.name}`,
          lines: [
            { accountId: expense.id, debit: total },
            { accountId: payable.id, credit: netPayable },
            ...(whtPayable !== undefined ? [{ accountId: whtPayable.id, credit: whtAmount }] : []),
          ],
        },
        tx,
      );

      return { bill, journal };
    });
  }

  // ---------------------------------------------------------------------------
  // Inventory
  // ---------------------------------------------------------------------------

  /** Catalog items with prices, costs, and on-hand stock. */
  async getItems() {
    const items = await this.db.item.findMany({ orderBy: { name: 'asc' } });
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      price: money(item.price),
      cost: money(item.cost),
      stockQuantity: item.stockQuantity,
    }));
  }

  async createItem(input: {
    name: string;
    sku?: string;
    price: Prisma.Decimal.Value;
    cost?: Prisma.Decimal.Value;
    stockQuantity?: number;
  }) {
    const name = input.name.trim();
    if (name === '') {
      throw new LedgerError('VALIDATION', 'Item name is required');
    }
    const price = toDecimal(input.price, 'item price');
    const cost = input.cost === undefined
      ? new Prisma.Decimal(0)
      : toDecimal(input.cost, 'item cost');
    if (price.isNegative() || cost.isNegative()) {
      throw new LedgerError('VALIDATION', 'Item price and cost must not be negative');
    }
    const stockQuantity = Math.max(0, Math.trunc(input.stockQuantity ?? 0));

    return this.db.item.create({
      data: {
        name,
        sku: input.sku?.trim() || null,
        price,
        cost,
        stockQuantity,
      },
    });
  }

  /** Adjust on-hand stock and propose the matching inventory journal. */
  async adjustStock(itemId: string, quantity: number, reason: string) {
    const delta = Math.trunc(quantity);
    if (!Number.isFinite(delta) || delta === 0) {
      throw new LedgerError('VALIDATION', 'Stock adjustment must be a non-zero whole number');
    }

    return this.db.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) {
        throw new LedgerError('NOT_FOUND', `Item ${itemId} not found`);
      }
      const nextStock = item.stockQuantity + delta;
      if (nextStock < 0) {
        throw new LedgerError('VALIDATION', 'Stock cannot go below zero');
      }
      const updated = await tx.item.update({
        where: { id: item.id },
        data: { stockQuantity: nextStock },
      });

      const value = new Prisma.Decimal(item.cost).times(Math.abs(delta));
      let journal: Awaited<ReturnType<LedgerEngine['proposeJournal']>> | undefined;
      if (value.gt(0)) {
        const inventory = await this.requireAccount(tx, 'Inventory', 'ASSET');
        if (delta > 0) {
          const adjustment = await this.requireAccount(tx, 'Inventory Adjustment', 'REVENUE');
          journal = await this.ledger.proposeJournal(
            {
              memo: `Stock adjustment: ${reason}`,
              lines: [
                { accountId: inventory.id, debit: value },
                { accountId: adjustment.id, credit: value },
              ],
            },
            tx,
          );
        } else {
          const cogs = await this.requireAccount(tx, 'Cost of Goods Sold', 'EXPENSE');
          journal = await this.ledger.proposeJournal(
            {
              memo: `Stock adjustment: ${reason}`,
              lines: [
                { accountId: cogs.id, debit: value },
                { accountId: inventory.id, credit: value },
              ],
            },
            tx,
          );
        }
      }

      return { item: updated, journal };
    });
  }

  // ---------------------------------------------------------------------------
  // Bank reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Match a bank transaction to an invoice (INFLOW) or bill (OUTFLOW).
   *
   * INFLOW matches capture the customer payment on the invoice and post the
   * Cash/AR journal, so the ledger reflects the reconciled receipt immediately.
   */
  async reconcileBankTransaction(
    transactionId: string,
    matchedId: string,
    matchedType: MatchedType,
  ) {
    const result = await this.db.$transaction(async (tx) => {
      const transaction = await tx.bankTransaction.findUnique({
        where: { id: transactionId },
      });
      if (!transaction) {
        throw new LedgerError('NOT_FOUND', `Bank transaction ${transactionId} not found`);
      }
      if (transaction.status === 'RECONCILED') {
        throw new LedgerError(
          'STATE',
          `Bank transaction ${transactionId} is already reconciled`,
        );
      }

      const amount = new Prisma.Decimal(transaction.amount).abs();
      if (amount.lte(0)) {
        throw new LedgerError('VALIDATION', 'Bank transaction amount must be non-zero');
      }

      if (transaction.type === 'INFLOW') {
        if (matchedType !== 'INVOICE') {
          throw new LedgerError(
            'VALIDATION',
            'INFLOW transactions must be matched to an invoice',
          );
        }

        const invoice = await tx.salesInvoice.findUnique({ where: { id: matchedId } });
        if (!invoice) {
          throw new LedgerError('NOT_FOUND', `Invoice ${matchedId} not found`);
        }

        const existingMatch = await tx.bankTransaction.findFirst({
          where: { matchedInvoiceId: matchedId },
        });
        if (existingMatch) {
          throw new LedgerError(
            'STATE',
            `Invoice ${invoice.invoiceNumber} is already matched to transaction ${existingMatch.id}`,
          );
        }

        const outstanding = new Prisma.Decimal(invoice.totalAmount).minus(invoice.amountPaid);
        if (outstanding.lte(0)) {
          throw new LedgerError('STATE', `Invoice ${invoice.invoiceNumber} has no outstanding balance`);
        }
        if (amount.gt(outstanding)) {
          throw new LedgerError(
            'VALIDATION',
            `Transaction amount ${money(amount)} exceeds invoice outstanding balance ${money(outstanding)}`,
          );
        }

        const cash = await tx.account.findFirst({
          where: { type: 'ASSET', name: { in: ['Cash', 'Bank'] } },
          orderBy: { code: 'asc' },
        });
        if (!cash) {
          throw new LedgerError('NOT_FOUND', 'Cash or Bank account is not configured');
        }
        const receivable = await this.requireAccount(tx, 'Accounts Receivable', 'ASSET');

        const newAmountPaid = new Prisma.Decimal(invoice.amountPaid).plus(amount);
        const fullyPaid = newAmountPaid.equals(invoice.totalAmount);
        await tx.salesInvoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newAmountPaid, status: fullyPaid ? 'PAID' : 'SENT' },
        });

        const journal = await this.ledger.proposeJournal(
          {
            date: transaction.date,
            memo: `Bank match for invoice ${invoice.invoiceNumber}`,
            lines: [
              { accountId: cash.id, debit: amount },
              { accountId: receivable.id, credit: amount },
            ],
          },
          tx,
        );

        const reconciled = await tx.bankTransaction.update({
          where: { id: transaction.id },
          data: { status: 'RECONCILED', matchedInvoiceId: matchedId },
        });

        return { transaction: reconciled, journal };
      }

      if (matchedType !== 'BILL') {
        throw new LedgerError('VALIDATION', 'OUTFLOW transactions must be matched to a bill');
      }

      const bill = await tx.purchaseBill.findUnique({ where: { id: matchedId } });
      if (!bill) {
        throw new LedgerError('NOT_FOUND', `Bill ${matchedId} not found`);
      }

      const existingMatch = await tx.bankTransaction.findFirst({
        where: { matchedBillId: matchedId },
      });
      if (existingMatch) {
        throw new LedgerError(
          'STATE',
          `Bill ${bill.billNumber} is already matched to transaction ${existingMatch.id}`,
        );
      }

      const outstanding = new Prisma.Decimal(bill.totalAmount).minus(bill.amountPaid);
      if (outstanding.lte(0)) {
        throw new LedgerError('STATE', `Bill ${bill.billNumber} has no outstanding balance`);
      }
      if (amount.gt(outstanding)) {
        throw new LedgerError(
          'VALIDATION',
          `Transaction amount ${money(amount)} exceeds bill outstanding balance ${money(outstanding)}`,
        );
      }

      const billMatch = await tx.bankTransaction.update({
        where: { id: transaction.id },
        data: { status: 'RECONCILED', matchedBillId: matchedId },
      });
      return { transaction: billMatch };
    });

    if (result.journal !== undefined) {
      const journal = await this.ledger.postJournal(result.journal.id);
      return { ...result, journal };
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Business profile
  // ---------------------------------------------------------------------------

  async getBusinessProfile() {
    const profile = await this.db.businessProfile.findFirst();
    if (!profile) return null;
    // Never expose the Drive refresh token to the browser.
    const { driveRefreshToken, ...safe } = profile;
    return {
      ...safe,
      driveConnected: profile.driveConnected && driveRefreshToken !== null,
    };
  }

  async updateBusinessProfile(input: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
    currency?: string;
    fiscalYearStart?: string;
    vatRate?: Prisma.Decimal.Value;
    whtRateCompany?: Prisma.Decimal.Value;
    whtRateIndividual?: Prisma.Decimal.Value;
  }) {
    const currency = input.currency ?? 'NGN';
    if (!['NGN', 'USD', 'GBP'].includes(currency)) {
      throw new LedgerError('VALIDATION', 'currency must be NGN, USD or GBP');
    }

    const rate = (
      value: Prisma.Decimal.Value | undefined,
      label: string,
      fallback: string,
    ): Prisma.Decimal => {
      const decimal = value === undefined
        ? new Prisma.Decimal(fallback)
        : toDecimal(value, label);
      if (decimal.isNegative() || decimal.gt(100)) {
        throw new LedgerError('VALIDATION', `${label} must be between 0 and 100`);
      }
      return decimal;
    };

    const vatRate = rate(input.vatRate, 'VAT rate', '7.5');
    const whtRateCompany = rate(input.whtRateCompany, 'company WHT rate', '10');
    const whtRateIndividual = rate(input.whtRateIndividual, 'individual WHT rate', '5');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.address !== undefined) data.address = input.address.trim();
    if (input.phone !== undefined) data.phone = input.phone.trim();
    if (input.email !== undefined) data.email = input.email.trim();
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl.trim() || null;
    if (input.currency !== undefined) data.currency = currency;
    if (input.fiscalYearStart !== undefined) data.fiscalYearStart = input.fiscalYearStart;
    if (input.vatRate !== undefined) data.vatRate = vatRate;
    if (input.whtRateCompany !== undefined) data.whtRateCompany = whtRateCompany;
    if (input.whtRateIndividual !== undefined) data.whtRateIndividual = whtRateIndividual;

    const existing = await this.db.businessProfile.findFirst();
    if (existing) {
      return this.db.businessProfile.update({ where: { id: existing.id }, data });
    }
    return this.db.businessProfile.create({
      data: {
        name: input.name?.trim() ?? '',
        address: input.address?.trim() ?? '',
        phone: input.phone?.trim() ?? '',
        email: input.email?.trim() ?? '',
        logoUrl: input.logoUrl?.trim() || null,
        currency,
        fiscalYearStart: input.fiscalYearStart ?? 'January',
        vatRate,
        whtRateCompany,
        whtRateIndividual,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Budgeting
  // ---------------------------------------------------------------------------

  async createBudget(input: {
    name: string;
    fiscalYear: number;
    lines: Array<{ accountId: string; amount: Prisma.Decimal.Value; period?: string }>;
  }) {
    const name = input.name.trim();
    if (name === '') throw new LedgerError('VALIDATION', 'Budget name is required');
    const fiscalYear = Math.trunc(input.fiscalYear);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      throw new LedgerError('VALIDATION', 'fiscalYear must be between 2000 and 2100');
    }
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new LedgerError('VALIDATION', 'Budget must contain at least one line');
    }

    const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
    const accounts = await this.db.account.findMany({ where: { id: { in: accountIds } } });
    const found = new Set(accounts.map((account) => account.id));
    const missing = accountIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new LedgerError('NOT_FOUND', `Account(s) not found: ${missing.join(', ')}`);
    }

    const lines = input.lines.map((line) => {
      const amount = toDecimal(line.amount, 'budget amount');
      if (amount.isNegative()) {
        throw new LedgerError('VALIDATION', 'Budget amount must not be negative');
      }
      return {
        accountId: line.accountId,
        amount,
        period: line.period === 'MONTHLY' ? 'MONTHLY' : 'ANNUAL',
      };
    });

    return this.db.budget.create({
      data: {
        name,
        fiscalYear,
        startDate: new Date(fiscalYear, 0, 1),
        endDate: new Date(fiscalYear, 11, 31, 23, 59, 59, 999),
        status: 'ACTIVE',
        lines: { create: lines },
      },
      include: { lines: true },
    });
  }

  async getBudgets() {
    const budgets = await this.db.budget.findMany({
      include: { lines: true },
      orderBy: [{ fiscalYear: 'desc' }, { name: 'asc' }],
    });
    return budgets.map((budget) => ({
      id: budget.id,
      name: budget.name,
      fiscalYear: budget.fiscalYear,
      status: budget.status,
      startDate: budget.startDate.toISOString(),
      endDate: budget.endDate.toISOString(),
      totalBudgeted: money(
        budget.lines.reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0)),
      ),
    }));
  }

  async getBudgetVsActual(budgetId: string) {
    const budget = await this.db.budget.findUnique({
      where: { id: budgetId },
      include: { lines: { include: { account: true } } },
    });
    if (!budget) throw new LedgerError('NOT_FOUND', `Budget ${budgetId} not found`);

    let totalBudgeted = new Prisma.Decimal(0);
    let totalActual = new Prisma.Decimal(0);

    const lines: Array<{
      accountId: string;
      code: string;
      account: string;
      type: string;
      period: string;
      budgeted: string;
      actual: string;
      variance: string;
      variancePercent: number;
    }> = [];
    for (const line of budget.lines) {
      const journalLines = await this.db.journalLine.findMany({
        where: {
          accountId: line.accountId,
          journalEntry: {
            status: 'POSTED',
            date: { gte: budget.startDate, lte: budget.endDate },
          },
        },
      });
      const debitNormal = line.account.type === 'ASSET' || line.account.type === 'EXPENSE';
      const actual = journalLines.reduce(
        (sum, entry) => sum.plus(
          debitNormal
            ? new Prisma.Decimal(entry.debit).minus(entry.credit)
            : new Prisma.Decimal(entry.credit).minus(entry.debit),
        ),
        new Prisma.Decimal(0),
      );
      const budgeted = new Prisma.Decimal(line.amount);
      const variance = budgeted.minus(actual);
      const variancePercent = budgeted.isZero()
        ? new Prisma.Decimal(0)
        : variance.div(budgeted).times(100).toDecimalPlaces(2);

      totalBudgeted = totalBudgeted.plus(budgeted);
      totalActual = totalActual.plus(actual);

      lines.push({
        accountId: line.accountId,
        code: line.account.code,
        account: line.account.name,
        type: line.account.type,
        period: line.period,
        budgeted: money(budgeted),
        actual: money(actual),
        variance: money(variance),
        variancePercent: variancePercent.toNumber(),
      });
    }

    return {
      budget: {
        id: budget.id,
        name: budget.name,
        fiscalYear: budget.fiscalYear,
        status: budget.status,
        startDate: budget.startDate.toISOString(),
        endDate: budget.endDate.toISOString(),
      },
      lines,
      totalBudgeted: money(totalBudgeted),
      totalActual: money(totalActual),
      totalVariance: money(totalBudgeted.minus(totalActual)),
    };
  }

  async deleteBudget(budgetId: string) {
    const budget = await this.db.budget.findUnique({ where: { id: budgetId } });
    if (!budget) throw new LedgerError('NOT_FOUND', `Budget ${budgetId} not found`);
    await this.db.budget.delete({ where: { id: budgetId } });
    return { deleted: true, id: budgetId };
  }


  // ---------------------------------------------------------------------------
  // Equity, loans and financing
  // ---------------------------------------------------------------------------

  async createEquityTransaction(input: {
    type: 'SHARE_CAPITAL' | 'RETAINED_EARNINGS_ADJUSTMENT';
    amount: Prisma.Decimal.Value;
    date?: string | Date;
    description?: string;
  }) {
    const amount = toDecimal(input.amount, 'equity amount');
    assertPrecision(amount, 'Equity amount');
    if (amount.lte(0)) throw new LedgerError('VALIDATION', 'Equity amount must be greater than zero');
    const date = parseDate(input.date, 'equity date');
    const label = input.description?.trim() || input.type.replace(/_/g, ' ').toLowerCase();

    return this.db.$transaction(async (tx) => {
      const cash = await this.requireAccount(tx, 'Cash', 'ASSET');
      const creditAccount = await this.requireAccount(
        tx,
        input.type === 'SHARE_CAPITAL' ? 'Share Capital' : 'Retained Earnings',
        'EQUITY',
      );

      const equity = await tx.equityTransaction.create({
        data: { type: input.type, amount, date, description: label },
      });
      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Equity: ${label}`,
          lines: [
            { accountId: cash.id, debit: amount },
            { accountId: creditAccount.id, credit: amount },
          ],
        },
        tx,
      );
      return { equity, journal };
    });
  }

  async recordDividend(input: {
    amount: Prisma.Decimal.Value;
    date?: string | Date;
    description?: string;
  }) {
    const amount = toDecimal(input.amount, 'dividend amount');
    assertPrecision(amount, 'Dividend amount');
    if (amount.lte(0)) throw new LedgerError('VALIDATION', 'Dividend amount must be greater than zero');
    const date = parseDate(input.date, 'dividend date');
    const label = input.description?.trim() || 'Dividend declared';

    return this.db.$transaction(async (tx) => {
      const cash = await this.requireAccount(tx, 'Cash', 'ASSET');
      const retained = await this.requireAccount(tx, 'Retained Earnings', 'EQUITY');

      const equity = await tx.equityTransaction.create({
        data: { type: 'DIVIDEND', amount, date, description: label },
      });
      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Dividend: ${label}`,
          lines: [
            { accountId: retained.id, debit: amount },
            { accountId: cash.id, credit: amount },
          ],
        },
        tx,
      );
      return { equity, journal };
    });
  }

  async createLoan(input: {
    lenderName: string;
    principalAmount: Prisma.Decimal.Value;
    interestRate: Prisma.Decimal.Value;
    startDate?: string | Date;
    termMonths: number;
  }) {
    const lenderName = input.lenderName.trim();
    if (lenderName === '') throw new LedgerError('VALIDATION', 'Lender name is required');
    const principal = toDecimal(input.principalAmount, 'loan principal');
    assertPrecision(principal, 'Loan principal');
    if (principal.lte(0)) throw new LedgerError('VALIDATION', 'Loan principal must be greater than zero');
    const rate = toDecimal(input.interestRate, 'interest rate');
    if (rate.isNegative() || rate.gt(100)) {
      throw new LedgerError('VALIDATION', 'Interest rate must be between 0 and 100');
    }
    const termMonths = Math.trunc(input.termMonths);
    if (!Number.isInteger(termMonths) || termMonths < 1) {
      throw new LedgerError('VALIDATION', 'termMonths must be a positive integer');
    }
    const startDate = parseDate(input.startDate, 'loan start date');

    return this.db.$transaction(async (tx) => {
      const cash = await this.requireAccount(tx, 'Cash', 'ASSET');
      const payable = await this.requireAccount(tx, 'Long-term Loans', 'LIABILITY');

      const loan = await tx.loan.create({
        data: {
          lenderName,
          principalAmount: principal,
          interestRate: rate,
          startDate,
          termMonths,
          balance: principal,
          status: 'ACTIVE',
        },
      });
      const journal = await this.ledger.proposeJournal(
        {
          date: startDate,
          memo: `Loan received from ${lenderName}`,
          lines: [
            { accountId: cash.id, debit: principal },
            { accountId: payable.id, credit: principal },
          ],
        },
        tx,
      );
      return { loan, journal };
    });
  }

  async recordLoanRepayment(
    loanId: string,
    amountInput: Prisma.Decimal.Value,
    bankAccountId: string,
    dateInput?: string | Date,
  ) {
    const amount = toDecimal(amountInput, 'repayment amount');
    assertPrecision(amount, 'Repayment amount');
    if (amount.lte(0)) throw new LedgerError('VALIDATION', 'Repayment amount must be greater than zero');
    const date = parseDate(dateInput, 'repayment date');

    return this.db.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id: loanId } });
      if (!loan) throw new LedgerError('NOT_FOUND', `Loan ${loanId} not found`);
      if (loan.status === 'PAID') throw new LedgerError('STATE', 'Loan is already fully paid');

      const bank = await tx.account.findUnique({ where: { id: bankAccountId } });
      if (!bank) throw new LedgerError('NOT_FOUND', `Account ${bankAccountId} not found`);
      if (bank.type !== 'ASSET') throw new LedgerError('VALIDATION', 'Bank account must be an ASSET account');

      const payable = await this.requireAccount(tx, 'Long-term Loans', 'LIABILITY');
      const interestAccount = await this.requireAccount(tx, 'Interest Expense', 'EXPENSE');

      const balance = new Prisma.Decimal(loan.balance);
      const monthlyInterest = balance
        .times(new Prisma.Decimal(loan.interestRate))
        .div(100)
        .div(12)
        .toDecimalPlaces(2);

      let interestPaid = amount.lt(monthlyInterest) ? amount : monthlyInterest;
      let principalPaid = amount.minus(interestPaid);
      if (principalPaid.gt(balance)) {
        principalPaid = balance;
        interestPaid = amount.minus(principalPaid);
      }
      const totalPaid = principalPaid.plus(interestPaid);
      const newBalance = balance.minus(principalPaid);

      const repayment = await tx.loanRepayment.create({
        data: { loanId: loan.id, date, principalPaid, interestPaid, totalPaid },
      });
      const updated = await tx.loan.update({
        where: { id: loan.id },
        data: { balance: newBalance, status: newBalance.lte(0) ? 'PAID' : 'ACTIVE' },
      });

      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Loan repayment - ${loan.lenderName}`,
          lines: [
            { accountId: payable.id, debit: principalPaid },
            { accountId: interestAccount.id, debit: interestPaid },
            { accountId: bank.id, credit: totalPaid },
          ],
        },
        tx,
      );
      return { loan: updated, repayment, journal };
    });
  }

  async getLoans() {
    const loans = await this.db.loan.findMany({
      include: { repayments: { orderBy: { date: 'desc' } } },
      orderBy: { startDate: 'desc' },
    });
    return loans.map((loan) => ({
      id: loan.id,
      lenderName: loan.lenderName,
      principalAmount: money(loan.principalAmount),
      interestRate: loan.interestRate.toString(),
      startDate: loan.startDate.toISOString(),
      termMonths: loan.termMonths,
      balance: money(loan.balance),
      status: loan.status,
      repayments: loan.repayments.length,
    }));
  }

  async getEquitySummary() {
    const accounts = await this.db.account.findMany({
      where: { name: { in: ['Share Capital', 'Retained Earnings', 'Dividends'] } },
    });
    const balanceOf = (name: string): Prisma.Decimal => {
      const account = accounts.find((entry) => entry.name === name);
      return account ? new Prisma.Decimal(account.balance) : new Prisma.Decimal(0);
    };

    const shareCapital = balanceOf('Share Capital');
    const retainedEarnings = balanceOf('Retained Earnings');
    const dividends = balanceOf('Dividends');

    const transactions = await this.db.equityTransaction.findMany({
      orderBy: { date: 'desc' },
      take: 25,
    });
    const dividendTotal = transactions
      .filter((entry) => entry.type === 'DIVIDEND')
      .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));

    return {
      shareCapital: money(shareCapital),
      retainedEarnings: money(retainedEarnings),
      dividends: money(dividends.gt(0) ? dividends : dividendTotal),
      totalEquity: money(shareCapital.plus(retainedEarnings).minus(dividends.gt(0) ? dividends : dividendTotal)),
      transactions: transactions.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: money(entry.amount),
        date: entry.date.toISOString(),
        description: entry.description,
      })),
    };
  }


  // ---------------------------------------------------------------------------
  // Projects and cost accounting
  // ---------------------------------------------------------------------------

  async createProject(input: {
    name: string;
    clientId?: string;
    budget: Prisma.Decimal.Value;
    startDate?: string | Date;
    endDate?: string | Date;
    status?: 'ACTIVE' | 'COMPLETED';
  }) {
    const name = input.name.trim();
    if (name === '') throw new LedgerError('VALIDATION', 'Project name is required');
    const budget = toDecimal(input.budget, 'project budget');
    assertPrecision(budget, 'Project budget');
    if (budget.isNegative()) throw new LedgerError('VALIDATION', 'Budget must not be negative');
    const startDate = parseDate(input.startDate, 'project start date');
    const endDate = input.endDate === undefined || input.endDate === null || input.endDate === ''
      ? null
      : parseDate(input.endDate, 'project end date');
    if (endDate !== null && endDate.getTime() < startDate.getTime()) {
      throw new LedgerError('VALIDATION', 'End date must be on or after the start date');
    }

    if (input.clientId !== undefined && input.clientId !== '') {
      const client = await this.db.customer.findUnique({ where: { id: input.clientId } });
      if (!client) throw new LedgerError('NOT_FOUND', `Customer ${input.clientId} not found`);
    }

    return this.db.project.create({
      data: {
        name,
        clientId: input.clientId === '' ? null : input.clientId ?? null,
        budget,
        startDate,
        endDate,
        status: input.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
      },
      include: { client: true },
    });
  }

  async getProjects() {
    const projects = await this.db.project.findMany({
      include: { client: true, transactions: true },
      orderBy: { startDate: 'desc' },
    });

    return projects.map((project) => {
      const revenue = project.transactions
        .filter((entry) => entry.type === 'REVENUE')
        .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
      const expenses = project.transactions
        .filter((entry) => entry.type === 'EXPENSE')
        .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
      const budget = new Prisma.Decimal(project.budget);
      const profit = revenue.minus(expenses);
      const margin = revenue.gt(0)
        ? profit.div(revenue).times(100).toDecimalPlaces(1)
        : new Prisma.Decimal(0);

      return {
        id: project.id,
        name: project.name,
        clientId: project.clientId,
        client: project.client?.name ?? null,
        budget: money(budget),
        spent: money(expenses),
        remaining: money(budget.minus(expenses)),
        revenue: money(revenue),
        profit: money(profit),
        margin: margin.toNumber(),
        startDate: project.startDate.toISOString(),
        endDate: project.endDate?.toISOString() ?? null,
        status: project.status,
        transactions: project.transactions.length,
      };
    });
  }

  async addProjectTransaction(input: {
    projectId: string;
    type: 'REVENUE' | 'EXPENSE';
    description: string;
    amount: Prisma.Decimal.Value;
    date?: string | Date;
  }) {
    const description = input.description.trim();
    if (description === '') throw new LedgerError('VALIDATION', 'Description is required');
    const amount = toDecimal(input.amount, 'transaction amount');
    assertPrecision(amount, 'Transaction amount');
    if (amount.lte(0)) throw new LedgerError('VALIDATION', 'Amount must be greater than zero');
    const date = parseDate(input.date, 'transaction date');

    const project = await this.db.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new LedgerError('NOT_FOUND', `Project ${input.projectId} not found`);

    return this.db.projectTransaction.create({
      data: {
        projectId: project.id,
        type: input.type === 'REVENUE' ? 'REVENUE' : 'EXPENSE',
        description,
        amount,
        date,
      },
    });
  }

  async getProjectProfitability(projectId: string) {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      include: { client: true, transactions: { orderBy: { date: 'asc' } } },
    });
    if (!project) throw new LedgerError('NOT_FOUND', `Project ${projectId} not found`);

    const revenueLines = project.transactions
      .filter((entry) => entry.type === 'REVENUE')
      .map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString(),
        description: entry.description,
        amount: money(entry.amount),
      }));
    const expenseLines = project.transactions
      .filter((entry) => entry.type === 'EXPENSE')
      .map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString(),
        description: entry.description,
        amount: money(entry.amount),
      }));

    const revenue = project.transactions
      .filter((entry) => entry.type === 'REVENUE')
      .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
    const expenses = project.transactions
      .filter((entry) => entry.type === 'EXPENSE')
      .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
    const profit = revenue.minus(expenses);
    const budget = new Prisma.Decimal(project.budget);
    const margin = revenue.gt(0)
      ? profit.div(revenue).times(100).toDecimalPlaces(1)
      : new Prisma.Decimal(0);

    return {
      project: {
        id: project.id,
        name: project.name,
        client: project.client?.name ?? null,
        budget: money(budget),
        startDate: project.startDate.toISOString(),
        endDate: project.endDate?.toISOString() ?? null,
        status: project.status,
      },
      revenueLines,
      expenseLines,
      totalRevenue: money(revenue),
      totalExpenses: money(expenses),
      profit: money(profit),
      margin: margin.toNumber(),
      spent: money(expenses),
      remaining: money(budget.minus(expenses)),
    };
  }

  // ---------------------------------------------------------------------------
  // Fixed assets
  // ---------------------------------------------------------------------------

  async getAssets() {
    const assets = await this.db.fixedAsset.findMany({
      orderBy: { purchaseDate: 'desc' },
    });
    return assets.map((asset) => {
      const cost = new Prisma.Decimal(asset.cost);
      const salvage = new Prisma.Decimal(asset.salvageValue);
      const accumulated = new Prisma.Decimal(asset.accumulatedDepreciation);
      const monthly = cost.minus(salvage)
        .div(asset.usefulLifeYears * 12)
        .toDecimalPlaces(2);
      return {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        purchaseDate: asset.purchaseDate.toISOString(),
        cost: money(cost),
        usefulLifeYears: asset.usefulLifeYears,
        salvageValue: money(salvage),
        accumulatedDepreciation: money(accumulated),
        bookValue: money(cost.minus(accumulated)),
        monthlyDepreciation: money(monthly),
        isDisposed: asset.isDisposed,
        disposalDate: asset.disposalDate?.toISOString() ?? null,
      };
    });
  }

  async createAsset(input: {
    name: string;
    category: string;
    purchaseDate: string | Date;
    cost: Prisma.Decimal.Value;
    usefulLifeYears: number;
    salvageValue?: Prisma.Decimal.Value;
  }) {
    const name = input.name.trim();
    const category = input.category.trim();
    if (name === '') throw new LedgerError('VALIDATION', 'Asset name is required');
    if (category === '') throw new LedgerError('VALIDATION', 'Asset category is required');
    const purchaseDate = parseDate(input.purchaseDate, 'purchase date');
    const cost = toDecimal(input.cost, 'asset cost');
    const salvageValue = input.salvageValue === undefined
      ? new Prisma.Decimal(0)
      : toDecimal(input.salvageValue, 'salvage value');
    const usefulLifeYears = Math.trunc(input.usefulLifeYears);
    if (cost.lte(0)) throw new LedgerError('VALIDATION', 'Asset cost must be greater than zero');
    if (salvageValue.isNegative() || salvageValue.gte(cost)) {
      throw new LedgerError('VALIDATION', 'Salvage value must be between zero and cost');
    }
    if (usefulLifeYears < 1) {
      throw new LedgerError('VALIDATION', 'Useful life must be at least one year');
    }

    return this.db.$transaction(async (tx) => {
      const fixedAssets = await this.requireAccount(tx, 'Fixed Assets', 'ASSET');
      const cash = await this.requireAccount(tx, 'Cash', 'ASSET');

      const asset = await tx.fixedAsset.create({
        data: {
          name,
          category,
          purchaseDate,
          cost,
          usefulLifeYears,
          salvageValue,
        },
      });

      const journal = await this.ledger.proposeJournal(
        {
          date: purchaseDate,
          memo: `Asset purchase: ${name}`,
          lines: [
            { accountId: fixedAssets.id, debit: cost },
            { accountId: cash.id, credit: cost },
          ],
        },
        tx,
      );

      return { asset, journal };
    });
  }

  async runDepreciation(monthNumber: number, yearNumber: number) {
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      throw new LedgerError('VALIDATION', 'month must be between 1 and 12');
    }
    const year = Math.trunc(yearNumber);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new LedgerError('VALIDATION', 'year must be between 2000 and 2100');
    }
    const month = String(monthNumber).padStart(2, '0');

    return this.db.$transaction(async (tx) => {
      const assets = await tx.fixedAsset.findMany({ where: { isDisposed: false } });
      if (assets.length === 0) {
        throw new LedgerError('VALIDATION', 'No active assets to depreciate');
      }

      let total = new Prisma.Decimal(0);
      const updates: Array<{ id: string; amount: Prisma.Decimal }> = [];
      for (const asset of assets) {
        const cost = new Prisma.Decimal(asset.cost);
        const salvage = new Prisma.Decimal(asset.salvageValue);
        const accumulated = new Prisma.Decimal(asset.accumulatedDepreciation);
        const remaining = cost.minus(salvage).minus(accumulated);
        if (remaining.lte(0)) continue;
        const monthly = cost.minus(salvage)
          .div(asset.usefulLifeYears * 12)
          .toDecimalPlaces(2);
        const amount = monthly.lt(remaining) ? monthly : remaining;
        updates.push({ id: asset.id, amount });
        total = total.plus(amount);
      }

      if (total.lte(0)) {
        throw new LedgerError('VALIDATION', 'Assets are already fully depreciated');
      }

      const depreciation = await this.requireAccount(tx, 'Depreciation Expense', 'EXPENSE');
      const accumulated = await this.requireAccount(tx, 'Accumulated Depreciation', 'ASSET');

      const journal = await this.ledger.proposeJournal(
        {
          date: new Date(year, monthNumber - 1, 1),
          memo: `Depreciation ${month}/${year}`,
          lines: [
            { accountId: depreciation.id, debit: total },
            { accountId: accumulated.id, credit: total },
          ],
        },
        tx,
      );

      for (const update of updates) {
        await tx.fixedAsset.update({
          where: { id: update.id },
          data: { accumulatedDepreciation: { increment: update.amount } },
        });
      }

      return { totalDepreciation: money(total), count: updates.length, journal };
    });
  }

  async disposeAsset(assetId: string, disposalDateInput: string | Date, proceedsInput?: Prisma.Decimal.Value) {
    const disposalDate = parseDate(disposalDateInput, 'disposal date');
    const proceeds = proceedsInput === undefined
      ? new Prisma.Decimal(0)
      : toDecimal(proceedsInput, 'disposal proceeds');
    if (proceeds.isNegative()) {
      throw new LedgerError('VALIDATION', 'Disposal proceeds must not be negative');
    }

    return this.db.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findUnique({ where: { id: assetId } });
      if (!asset) throw new LedgerError('NOT_FOUND', `Asset ${assetId} not found`);
      if (asset.isDisposed) throw new LedgerError('STATE', 'Asset is already disposed');

      const cost = new Prisma.Decimal(asset.cost);
      const accumulated = new Prisma.Decimal(asset.accumulatedDepreciation);
      const bookValue = cost.minus(accumulated);
      const difference = proceeds.minus(bookValue);

      const cash = await this.requireAccount(tx, 'Cash', 'ASSET');
      const fixedAssets = await this.requireAccount(tx, 'Fixed Assets', 'ASSET');
      const accumulatedAccount = await this.requireAccount(tx, 'Accumulated Depreciation', 'ASSET');

      const lines = [
        ...(proceeds.gt(0) ? [{ accountId: cash.id, debit: proceeds }] : []),
        ...(accumulated.gt(0) ? [{ accountId: accumulatedAccount.id, debit: accumulated }] : []),
        ...(difference.lt(0)
          ? [{
            accountId: (await this.requireAccount(tx, 'Loss on Asset Disposal', 'EXPENSE')).id,
            debit: difference.abs(),
          }]
          : []),
        { accountId: fixedAssets.id, credit: cost },
        ...(difference.gt(0)
          ? [{
            accountId: (await this.requireAccount(tx, 'Gain on Asset Disposal', 'REVENUE')).id,
            credit: difference,
          }]
          : []),
      ];

      const journal = await this.ledger.proposeJournal(
        {
          date: disposalDate,
          memo: `Asset disposal: ${asset.name}`,
          lines,
        },
        tx,
      );

      const disposed = await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { isDisposed: true, disposalDate },
      });

      return { asset: disposed, journal, gainOrLoss: money(difference) };
    });
  }

  // ---------------------------------------------------------------------------
  // Expenses & reimbursements
  // ---------------------------------------------------------------------------

  async getExpenseCategories() {
    return this.db.expenseCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createExpenseCategory(input: { name: string }) {
    const name = input.name.trim();
    if (name === '') throw new LedgerError('VALIDATION', 'Category name is required');
    const existing = await this.db.expenseCategory.findFirst({ where: { name } });
    if (existing) return existing;
    return this.db.expenseCategory.create({ data: { name } });
  }

  async getExpenses() {
    const expenses = await this.db.expense.findMany({
      include: { category: true, employee: true },
      orderBy: { date: 'desc' },
    });
    return expenses.map((expense) => ({
      id: expense.id,
      date: expense.date.toISOString(),
      description: expense.description,
      amount: money(expense.amount),
      categoryId: expense.categoryId,
      category: expense.category.name,
      employeeId: expense.employeeId,
      employee: expense.employee?.name ?? null,
      paymentMethod: expense.paymentMethod,
      status: expense.status,
      journalEntryId: expense.journalEntryId,
    }));
  }

  async createExpense(input: {
    date: string | Date;
    description: string;
    amount: Prisma.Decimal.Value;
    categoryId: string;
    employeeId?: string;
    paymentMethod: 'CASH' | 'BANK' | 'REIMBURSEMENT';
  }) {
    const date = parseDate(input.date, 'expense date');
    const description = input.description.trim();
    if (description === '') throw new LedgerError('VALIDATION', 'Description is required');
    const amount = toDecimal(input.amount, 'expense amount');
    assertPrecision(amount, 'Expense amount');
    if (amount.lte(0)) throw new LedgerError('VALIDATION', 'Expense amount must be greater than zero');
    if (!['CASH', 'BANK', 'REIMBURSEMENT'].includes(input.paymentMethod)) {
      throw new LedgerError('VALIDATION', 'paymentMethod must be CASH, BANK or REIMBURSEMENT');
    }

    const result = await this.db.$transaction(async (tx) => {
      const category = await tx.expenseCategory.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new LedgerError('NOT_FOUND', `Category ${input.categoryId} not found`);

      let employeeId: string | null = null;
      if (input.paymentMethod === 'REIMBURSEMENT') {
        if (input.employeeId === undefined || input.employeeId === '') {
          throw new LedgerError('VALIDATION', 'employeeId is required for a reimbursement');
        }
        const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
        if (!employee) throw new LedgerError('NOT_FOUND', `Employee ${input.employeeId} not found`);
        employeeId = employee.id;
      }

      const expenseAccount = await tx.account.findFirst({
        where: { name: `${category.name} Expense` },
      })
        ?? await tx.account.findFirst({ where: { name: 'Office Supplies Expense' } })
        ?? await tx.account.findFirst({ where: { type: 'EXPENSE' }, orderBy: { code: 'asc' } });
      if (!expenseAccount) throw new LedgerError('NOT_FOUND', 'No expense account is configured');

      const creditAccount = input.paymentMethod === 'CASH'
        ? await this.requireAccount(tx, 'Cash', 'ASSET')
        : input.paymentMethod === 'BANK'
          ? await this.requireAccount(tx, 'Bank', 'ASSET')
          : await this.requireAccount(tx, 'Employee Reimbursement Payable', 'LIABILITY');

      const status = input.paymentMethod === 'REIMBURSEMENT' ? 'PENDING' : 'APPROVED';
      const journal = await this.ledger.proposeJournal(
        {
          date,
          memo: `Expense: ${description}`,
          lines: [
            { accountId: expenseAccount.id, debit: amount },
            { accountId: creditAccount.id, credit: amount },
          ],
        },
        tx,
      );

      const expense = await tx.expense.create({
        data: {
          date,
          description,
          amount,
          categoryId: category.id,
          employeeId,
          paymentMethod: input.paymentMethod,
          status,
          journalEntryId: journal.id,
        },
        include: { category: true, employee: true },
      });

      return { expense, journal };
    });

    if (input.paymentMethod === 'REIMBURSEMENT') return result;

    const journal = await this.ledger.postJournal(result.journal.id);
    return { ...result, journal };
  }

  /** Approve a pending reimbursement and post its journal. */
  async approveExpense(expenseId: string) {
    const expense = await this.db.expense.findUnique({
      where: { id: expenseId },
      include: { category: true, employee: true },
    });
    if (!expense) throw new LedgerError('NOT_FOUND', `Expense ${expenseId} not found`);
    if (expense.paymentMethod !== 'REIMBURSEMENT') {
      throw new LedgerError('STATE', 'Only reimbursement claims need approval');
    }
    if (expense.status !== 'PENDING') {
      throw new LedgerError('STATE', `Expense ${expenseId} is not pending`);
    }

    if (expense.journalEntryId !== null) {
      const journal = await this.db.journalEntry.findUnique({
        where: { id: expense.journalEntryId },
      });
      if (journal?.status === 'PENDING') {
        await this.ledger.postJournal(journal.id);
      }
    }

    return this.db.expense.update({
      where: { id: expense.id },
      data: { status: 'APPROVED' },
      include: { category: true, employee: true },
    });
  }

  // ---------------------------------------------------------------------------
  // Payroll
  // ---------------------------------------------------------------------------

  /** Employees with their monthly gross pay. */
  async getEmployees() {
    const employees = await this.db.employee.findMany({ orderBy: { name: 'asc' } });
    return employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      basicSalary: money(employee.basicSalary),
      housingAllowance: money(employee.housingAllowance),
      transportAllowance: money(employee.transportAllowance),
      grossSalary: money(
        new Prisma.Decimal(employee.basicSalary)
          .plus(employee.housingAllowance)
          .plus(employee.transportAllowance),
      ),
      isActive: employee.isActive,
    }));
  }

  async createEmployee(input: {
    name: string;
    email?: string;
    basicSalary: Prisma.Decimal.Value;
    housingAllowance?: Prisma.Decimal.Value;
    transportAllowance?: Prisma.Decimal.Value;
    isActive?: boolean;
  }) {
    const name = input.name.trim();
    if (name === '') throw new LedgerError('VALIDATION', 'Employee name is required');
    const basicSalary = toDecimal(input.basicSalary, 'basic salary');
    const housingAllowance = input.housingAllowance === undefined
      ? new Prisma.Decimal(0)
      : toDecimal(input.housingAllowance, 'housing allowance');
    const transportAllowance = input.transportAllowance === undefined
      ? new Prisma.Decimal(0)
      : toDecimal(input.transportAllowance, 'transport allowance');
    if (basicSalary.isNegative() || housingAllowance.isNegative() || transportAllowance.isNegative()) {
      throw new LedgerError('VALIDATION', 'Salary components must not be negative');
    }
    return this.db.employee.create({
      data: {
        name,
        email: input.email?.trim() || null,
        basicSalary,
        housingAllowance,
        transportAllowance,
        isActive: input.isActive ?? true,
      },
    });
  }

  /** Simplified Nigerian PAYE on annual gross income. */
  private computePaye(annualGross: Prisma.Decimal): Prisma.Decimal {
    const bands: Array<[Prisma.Decimal, Prisma.Decimal]> = [
      [new Prisma.Decimal(300000), new Prisma.Decimal('0.07')],
      [new Prisma.Decimal(300000), new Prisma.Decimal('0.11')],
      [new Prisma.Decimal(500000), new Prisma.Decimal('0.15')],
      [new Prisma.Decimal(500000), new Prisma.Decimal('0.19')],
      [new Prisma.Decimal(1600000), new Prisma.Decimal('0.21')],
    ];
    let remaining = annualGross;
    let tax = new Prisma.Decimal(0);
    for (const [limit, rate] of bands) {
      if (remaining.lte(0)) break;
      const slice = remaining.lt(limit) ? remaining : limit;
      tax = tax.plus(slice.times(rate));
      remaining = remaining.minus(slice);
    }
    if (remaining.gt(0)) tax = tax.plus(remaining.times('0.24'));
    return tax.toDecimalPlaces(2);
  }

  /** Calculate one month's payroll and propose the consolidated journal. */
  async runPayroll(monthNumber: number, yearNumber: number) {
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      throw new LedgerError('VALIDATION', 'month must be between 1 and 12');
    }
    const year = Math.trunc(yearNumber);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new LedgerError('VALIDATION', 'year must be between 2000 and 2100');
    }
    const month = String(monthNumber).padStart(2, '0');

    return this.db.$transaction(async (tx) => {
      const existing = await tx.payrollRun.findFirst({
        where: { month, year },
      });
      if (existing) {
        throw new LedgerError('STATE', `Payroll for ${month}/${year} has already been run`);
      }

      const employees = await tx.employee.findMany({ where: { isActive: true } });
      if (employees.length === 0) {
        throw new LedgerError('VALIDATION', 'No active employees to pay');
      }

      let totalGross = new Prisma.Decimal(0);
      let totalPaye = new Prisma.Decimal(0);
      let totalPension = new Prisma.Decimal(0);
      let totalNhf = new Prisma.Decimal(0);
      let totalNet = new Prisma.Decimal(0);

      for (const employee of employees) {
        const gross = new Prisma.Decimal(employee.basicSalary)
          .plus(employee.housingAllowance)
          .plus(employee.transportAllowance);
        const pension = gross.times('0.08').toDecimalPlaces(2);
        const nhf = new Prisma.Decimal(employee.basicSalary).times('0.025').toDecimalPlaces(2);
        const paye = this.computePaye(gross.times(12)).div(12).toDecimalPlaces(2);
        const net = gross.minus(pension).minus(nhf).minus(paye);

        totalGross = totalGross.plus(gross);
        totalPaye = totalPaye.plus(paye);
        totalPension = totalPension.plus(pension);
        totalNhf = totalNhf.plus(nhf);
        totalNet = totalNet.plus(net);
      }

      const salaries = await this.requireAccount(tx, 'Salaries Expense', 'EXPENSE');
      const payePayable = await this.requireAccount(tx, 'PAYE Payable', 'LIABILITY');
      const pensionPayable = await this.requireAccount(tx, 'Pension Payable', 'LIABILITY');
      const nhfPayable = await this.requireAccount(tx, 'NHF Payable', 'LIABILITY');
      const netPayable = await this.requireAccount(tx, 'Net Salaries Payable', 'LIABILITY');

      const journal = await this.ledger.proposeJournal(
        {
          date: new Date(year, monthNumber - 1, 1),
          memo: `Payroll ${month}/${year}`,
          lines: [
            { accountId: salaries.id, debit: totalGross },
            { accountId: payePayable.id, credit: totalPaye },
            { accountId: pensionPayable.id, credit: totalPension },
            { accountId: nhfPayable.id, credit: totalNhf },
            { accountId: netPayable.id, credit: totalNet },
          ],
        },
        tx,
      );

      const run = await tx.payrollRun.create({
        data: {
          month,
          year,
          status: 'DRAFT',
          totalGross,
          totalNet,
          totalPaye,
          totalPension,
          totalNhf,
        },
      });

      return { run, journal };
    });
  }

  async getPayrollHistory() {
    const runs = await this.db.payrollRun.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return runs.map((run) => ({
      id: run.id,
      month: run.month,
      year: run.year,
      status: run.status,
      totalGross: money(run.totalGross),
      totalNet: money(run.totalNet),
      totalPaye: money(run.totalPaye),
      totalPension: money(run.totalPension),
      totalNhf: money(run.totalNhf),
    }));
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  /** Journals awaiting approval, with their lines and account names. */
  async getPendingJournals() {
    const journals = await this.db.journalEntry.findMany({
      where: { status: 'PENDING' },
      include: { lines: { include: { account: true } } },
      orderBy: { date: 'desc' },
    });

    return journals.map((journal) => {
      const totalDebit = journal.lines.reduce(
        (sum, line) => sum.plus(line.debit),
        new Prisma.Decimal(0),
      );
      const totalCredit = journal.lines.reduce(
        (sum, line) => sum.plus(line.credit),
        new Prisma.Decimal(0),
      );

      return {
        id: journal.id,
        date: journal.date.toISOString(),
        memo: journal.memo,
        status: journal.status,
        totalDebit: money(totalDebit),
        totalCredit: money(totalCredit),
        lines: journal.lines.map((line) => ({
          id: line.id,
          accountId: line.accountId,
          code: line.account.code,
          account: line.account.name,
          debit: money(line.debit),
          credit: money(line.credit),
        })),
      };
    });
  }

  /** VAT and WHT position from their liability accounts (proposed + posted). */
  async getTaxSummary() {
    const [vat, wht] = await Promise.all([
      this.db.account.findFirst({ where: { name: 'VAT Payable' } }),
      this.db.account.findFirst({ where: { name: 'WHT Payable' } }),
    ]);

    const balanceOf = async (accountId?: string) => {
      if (accountId === undefined) return new Prisma.Decimal(0);
      const lines = await this.db.journalLine.findMany({ where: { accountId } });
      return lines.reduce(
        (sum, line) => sum.plus(line.credit).minus(line.debit),
        new Prisma.Decimal(0),
      );
    };

    const [vatTotal, whtTotal] = await Promise.all([
      balanceOf(vat?.id),
      balanceOf(wht?.id),
    ]);

    return {
      vatPayable: money(vatTotal),
      whtPayable: money(whtTotal),
    };
  }

  async getArAging(asOfInput?: string | Date) {
    const asOf = parseDate(asOfInput, 'asOf date');
    const invoices = await this.db.salesInvoice.findMany({
      where: { status: { not: 'PAID' } },
      include: { customer: true, lines: true },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = this.emptyAgingBuckets();
    let totalOutstanding = new Prisma.Decimal(0);

    const items = invoices.flatMap((invoice) => {
      const outstanding = new Prisma.Decimal(invoice.totalAmount).minus(invoice.amountPaid);
      if (outstanding.lte(0)) return [];

      const daysPastDue = daysBetween(asOf, invoice.dueDate);
      const bucket = bucketFor(daysPastDue);
      const subtotal = invoice.lines.reduce(
        (sum, line) => sum.plus(line.total),
        new Prisma.Decimal(0),
      );
      const vat = new Prisma.Decimal(invoice.totalAmount).minus(subtotal);

      buckets[bucket].count += 1;
      buckets[bucket].total = buckets[bucket].total.plus(outstanding);
      totalOutstanding = totalOutstanding.plus(outstanding);

      return [
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customer: invoice.customer.name,
          date: invoice.date.toISOString(),
          dueDate: invoice.dueDate.toISOString(),
          total: money(invoice.totalAmount),
          amountPaid: money(invoice.amountPaid),
          outstanding: money(outstanding),
          subtotal: money(subtotal),
          vat: money(vat),
          daysPastDue,
          bucket,
        },
      ];
    });

    return {
      asOf: asOf.toISOString(),
      buckets: this.serializeAgingBuckets(buckets),
      totalOutstanding: money(totalOutstanding),
      invoices: items,
    };
  }

  async getApAging(asOfInput?: string | Date) {
    const asOf = parseDate(asOfInput, 'asOf date');
    const bills = await this.db.purchaseBill.findMany({
      where: { status: { not: 'PAID' } },
      include: { vendor: true },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = this.emptyAgingBuckets();
    let totalOutstanding = new Prisma.Decimal(0);

    const items = bills.flatMap((bill) => {
      const outstanding = new Prisma.Decimal(bill.totalAmount).minus(bill.amountPaid);
      if (outstanding.lte(0)) return [];

      const daysPastDue = daysBetween(asOf, bill.dueDate);
      const bucket = bucketFor(daysPastDue);

      buckets[bucket].count += 1;
      buckets[bucket].total = buckets[bucket].total.plus(outstanding);
      totalOutstanding = totalOutstanding.plus(outstanding);

      return [
        {
          billId: bill.id,
          billNumber: bill.billNumber,
          vendor: bill.vendor.name,
          date: bill.date.toISOString(),
          dueDate: bill.dueDate.toISOString(),
          total: money(bill.totalAmount),
          amountPaid: money(bill.amountPaid),
          outstanding: money(outstanding),
          daysPastDue,
          bucket,
        },
      ];
    });

    const vendorTotals = new Map<string, {
      total: Prisma.Decimal;
      current: Prisma.Decimal;
      days1_30: Prisma.Decimal;
      days31_60: Prisma.Decimal;
      days60Plus: Prisma.Decimal;
    }>();

    for (const item of items) {
      const row = vendorTotals.get(item.vendor) ?? {
        total: new Prisma.Decimal(0),
        current: new Prisma.Decimal(0),
        days1_30: new Prisma.Decimal(0),
        days31_60: new Prisma.Decimal(0),
        days60Plus: new Prisma.Decimal(0),
      };
      const value = new Prisma.Decimal(item.outstanding);
      row.total = row.total.plus(value);
      if (item.bucket === 'current') row.current = row.current.plus(value);
      else if (item.bucket === '1-30') row.days1_30 = row.days1_30.plus(value);
      else if (item.bucket === '31-60') row.days31_60 = row.days31_60.plus(value);
      else row.days60Plus = row.days60Plus.plus(value);
      vendorTotals.set(item.vendor, row);
    }

    return {
      asOf: asOf.toISOString(),
      buckets: this.serializeAgingBuckets(buckets),
      totalOutstanding: money(totalOutstanding),
      bills: items,
      vendors: [...vendorTotals.entries()].map(([vendor, row]) => ({
        vendor,
        totalOutstanding: money(row.total),
        current: money(row.current),
        '1-30': money(row.days1_30),
        '31-60': money(row.days31_60),
        '60+': money(row.days60Plus),
      })),
    };
  }

  async getUnreconciledTransactions() {
    const transactions = await this.db.bankTransaction.findMany({
      where: { status: 'UNRECONCILED' },
      orderBy: { date: 'desc' },
    });

    return {
      count: transactions.length,
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date.toISOString(),
        description: transaction.description,
        amount: money(transaction.amount),
        type: transaction.type,
        status: transaction.status,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async requireAccount(
    db: Prisma.TransactionClient,
    name: string,
    expectedType?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  ) {
    const account = await db.account.findFirst({ where: { name } });
    if (!account) {
      throw new LedgerError('NOT_FOUND', `Required account "${name}" is not configured`);
    }
    if (expectedType && account.type !== expectedType) {
      throw new LedgerError(
        'STATE',
        `Account "${name}" must be of type ${expectedType} (found ${account.type})`,
      );
    }
    return account;
  }

  private async buildInvoiceLines(
    db: Prisma.TransactionClient,
    items: InvoiceItemInput[],
  ): Promise<NormalizedInvoiceLine[]> {
    const itemIds = [
      ...new Set(
        items
          .map((item) => item.itemId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    const catalog =
      itemIds.length > 0
        ? await db.item.findMany({ where: { id: { in: itemIds } } })
        : [];
    const catalogById = new Map(catalog.map((item) => [item.id, item]));

    return items.map((item, index) => {
      const label = `Invoice line ${index + 1}`;
      let description = item.description?.trim() ?? '';
      let unitPrice: Prisma.Decimal;

      if (item.itemId) {
        const catalogItem = catalogById.get(item.itemId);
        if (!catalogItem) {
          throw new LedgerError('NOT_FOUND', `${label}: item ${item.itemId} not found`);
        }
        if (!description) description = catalogItem.name;
        unitPrice =
          item.unitPrice === undefined || item.unitPrice === null
            ? new Prisma.Decimal(catalogItem.price)
            : toDecimal(item.unitPrice, `${label} unit price`);
      } else {
        if (!description) {
          throw new LedgerError(
            'VALIDATION',
            `${label}: description is required when itemId is not provided`,
          );
        }
        if (item.unitPrice === undefined || item.unitPrice === null) {
          throw new LedgerError(
            'VALIDATION',
            `${label}: unitPrice is required when itemId is not provided`,
          );
        }
        unitPrice = toDecimal(item.unitPrice, `${label} unit price`);
      }

      const quantity = toDecimal(item.quantity, `${label} quantity`);
      if (quantity.lte(0)) {
        throw new LedgerError('VALIDATION', `${label}: quantity must be greater than zero`);
      }
      if (unitPrice.isNegative()) {
        throw new LedgerError('VALIDATION', `${label}: unitPrice must not be negative`);
      }
      assertPrecision(unitPrice, `${label} unit price`);

      const total = quantity.mul(unitPrice).toDecimalPlaces(2);
      assertPrecision(total, `${label} total`);

      return {
        itemId: item.itemId ?? null,
        description,
        quantity,
        unitPrice,
        total,
      };
    });
  }

  private buildBillLines(items: BillItemInput[]): NormalizedBillLine[] {
    return items.map((item, index) => {
      const label = `Bill line ${index + 1}`;
      const description = item.description?.trim();
      if (!description) {
        throw new LedgerError('VALIDATION', `${label}: description is required`);
      }

      const quantity = toDecimal(item.quantity, `${label} quantity`);
      if (quantity.lte(0)) {
        throw new LedgerError('VALIDATION', `${label}: quantity must be greater than zero`);
      }

      const unitCost = toDecimal(item.unitCost, `${label} unit cost`);
      if (unitCost.isNegative()) {
        throw new LedgerError('VALIDATION', `${label}: unitCost must not be negative`);
      }
      assertPrecision(unitCost, `${label} unit cost`);

      const total = quantity.mul(unitCost).toDecimalPlaces(2);
      assertPrecision(total, `${label} total`);

      return { description, quantity, unitCost, total };
    });
  }

  private emptyAgingBuckets(): Record<
    AgingBucketKey,
    { count: number; total: Prisma.Decimal }
  > {
    return {
      current: { count: 0, total: new Prisma.Decimal(0) },
      '1-30': { count: 0, total: new Prisma.Decimal(0) },
      '31-60': { count: 0, total: new Prisma.Decimal(0) },
      '61-90': { count: 0, total: new Prisma.Decimal(0) },
      '90+': { count: 0, total: new Prisma.Decimal(0) },
    };
  }

  private serializeAgingBuckets(
    buckets: Record<AgingBucketKey, { count: number; total: Prisma.Decimal }>,
  ) {
    return AGING_BUCKETS.map(({ key, label }) => ({
      key,
      label,
      count: buckets[key].count,
      total: money(buckets[key].total),
    }));
  }
}

export const erpService = new ErpService();

/** An ERP service confined to one company (for request handlers). */
export const erpFor = (companyId: string): ErpService =>
  new ErpService(ledgerFor(companyId), companyPrisma(companyId));
