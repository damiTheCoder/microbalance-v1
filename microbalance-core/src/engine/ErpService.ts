import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { LedgerError } from './errors.js';
import { assertPrecision, money, toDecimal } from './money.js';
import { addDays, daysBetween, parseDate } from './dates.js';
import { LedgerEngine } from './LedgerEngine.js';

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
      const total = lines.reduce(
        (sum, line) => sum.plus(line.total),
        new Prisma.Decimal(0),
      );
      if (total.lte(0)) {
        throw new LedgerError('VALIDATION', 'Invoice total must be greater than zero');
      }

      const receivable = await this.requireAccount(tx, 'Accounts Receivable', 'ASSET');
      const revenue = await this.requireAccount(tx, 'Sales Revenue', 'REVENUE');

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
            { accountId: revenue.id, credit: total },
          ],
        },
        tx,
      );

      return { invoice, journal };
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

      const inventory = await this.requireAccount(tx, 'Inventory', 'ASSET');
      const payable = await this.requireAccount(tx, 'Accounts Payable', 'LIABILITY');

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
            { accountId: inventory.id, debit: total },
            { accountId: payable.id, credit: total },
          ],
        },
        tx,
      );

      return { bill, journal };
    });
  }

  // ---------------------------------------------------------------------------
  // Bank reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Match a bank transaction to an invoice (INFLOW) or bill (OUTFLOW).
   *
   * Only matching is recorded here; capturing the payment itself stays a
   * separate, explicit action (recordInvoicePayment) so a reconciliation can
   * never silently double-post the ledger.
   */
  async reconcileBankTransaction(
    transactionId: string,
    matchedId: string,
    matchedType: MatchedType,
  ) {
    return this.db.$transaction(async (tx) => {
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

        return tx.bankTransaction.update({
          where: { id: transaction.id },
          data: { status: 'RECONCILED', matchedInvoiceId: matchedId },
        });
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

      return tx.bankTransaction.update({
        where: { id: transaction.id },
        data: { status: 'RECONCILED', matchedBillId: matchedId },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  async getArAging(asOfInput?: string | Date) {
    const asOf = parseDate(asOfInput, 'asOf date');
    const invoices = await this.db.salesInvoice.findMany({
      where: { status: { not: 'PAID' } },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = this.emptyAgingBuckets();
    let totalOutstanding = new Prisma.Decimal(0);

    const items = invoices.flatMap((invoice) => {
      const outstanding = new Prisma.Decimal(invoice.totalAmount).minus(invoice.amountPaid);
      if (outstanding.lte(0)) return [];

      const daysPastDue = daysBetween(asOf, invoice.dueDate);
      const bucket = bucketFor(daysPastDue);

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

    return {
      asOf: asOf.toISOString(),
      buckets: this.serializeAgingBuckets(buckets),
      totalOutstanding: money(totalOutstanding),
      bills: items,
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
    const account = await db.account.findUnique({ where: { name } });
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
