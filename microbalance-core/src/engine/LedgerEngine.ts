import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { companyPrisma } from '../lib/tenancy.js';
import { isDebitNormal } from '../domain/types.js';
import type { JournalStatus } from '../domain/types.js';
import { LedgerError } from './errors.js';
import { assertPrecision, assertNonNegative, money, toDecimal } from './money.js';
import { parseDate } from './dates.js';

/** Either the root client or a transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface JournalLineInput {
  accountId: string;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
}

export interface NormalizedJournalLine {
  accountId: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

export interface ProposeJournalInput {
  date?: string | Date;
  memo?: string | null;
  lines: JournalLineInput[];
}

export interface ReportRange {
  from?: string | Date;
  to?: string | Date;
}

export interface GeneralLedgerQuery extends ReportRange {
  accountId?: string;
  status?: JournalStatus;
}

interface AccountAggregate {
  accountId: string;
  name: string;
  type: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

/**
 * The only place account balances are ever mutated.
 *
 * Journals are created as PENDING proposals (no balance impact) and become
 * POSTED exactly once through postJournal(), which applies normal-signed
 * deltas inside a transaction.
 */
export class LedgerEngine {
  constructor(private readonly db: PrismaClient = prisma) {}

  // ---------------------------------------------------------------------------
  // Core ledger
  // ---------------------------------------------------------------------------

  /**
   * Validate a set of journal lines. Throws LedgerError('VALIDATION') when:
   *  - there are no lines
   *  - total debits and total credits differ
   *  - a debit or credit is negative
   *  - a value has more than 2 decimal places
   *  - a single line has both a debit and a credit
   */
  validateJournal(lines: JournalLineInput[]): NormalizedJournalLine[] {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new LedgerError('VALIDATION', 'Journal must contain at least one line');
    }

    const normalized: NormalizedJournalLine[] = [];
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    lines.forEach((raw, index) => {
      const label = `Line ${index + 1}`;
      if (typeof raw?.accountId !== 'string' || raw.accountId.trim() === '') {
        throw new LedgerError('VALIDATION', `${label}: accountId is required`);
      }

      const debit = toDecimal(raw.debit, `${label} debit`);
      const credit = toDecimal(raw.credit, `${label} credit`);

      assertNonNegative(debit, `${label} debit`);
      assertNonNegative(credit, `${label} credit`);
      assertPrecision(debit, `${label} debit`);
      assertPrecision(credit, `${label} credit`);

      if (debit.gt(0) && credit.gt(0)) {
        throw new LedgerError(
          'VALIDATION',
          `${label}: a line cannot have both a debit and a credit`,
        );
      }

      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);
      normalized.push({ accountId: raw.accountId, debit, credit });
    });

    if (!totalDebit.equals(totalCredit)) {
      throw new LedgerError(
        'VALIDATION',
        `Journal is unbalanced: debits ${totalDebit.toFixed(2)} != credits ${totalCredit.toFixed(2)}`,
      );
    }

    return normalized;
  }

  /**
   * Persist a validated journal as PENDING. Account balances are untouched
   * until the proposal is posted.
   */
  async proposeJournal(input: ProposeJournalInput, db: Db = this.db) {
    const lines = this.validateJournal(input.lines);
    const date = parseDate(input.date, 'journal date');

    const accountIds = [...new Set(lines.map((line) => line.accountId))];
    const accounts = await db.account.findMany({ where: { id: { in: accountIds } } });
    const found = new Set(accounts.map((account) => account.id));
    const missing = accountIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new LedgerError('NOT_FOUND', `Account(s) not found: ${missing.join(', ')}`);
    }

    return db.journalEntry.create({
      data: {
        date,
        memo: input.memo ?? null,
        status: 'PENDING',
        lines: {
          create: lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /**
   * Post a PENDING journal exactly once.
   *
   * The status flip is the concurrency guard: updateMany only matches while the
   * entry is still PENDING, so a second caller gets 0 rows and a STATE error.
   * Balance deltas are normal-signed:
   *   ASSET / EXPENSE      -> debit - credit
   *   LIABILITY / EQUITY / REVENUE -> credit - debit
   */
  async postJournal(id: string) {
    const guard = await this.db.journalEntry.findUnique({
      where: { id },
      select: { isLocked: true },
    });
    if (guard?.isLocked === true) {
      throw new LedgerError('STATE', 'Period is locked.');
    }

    return this.db.$transaction(async (tx) => {
      const claim = await tx.journalEntry.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'POSTED' },
      });

      if (claim.count === 0) {
        const existing = await tx.journalEntry.findUnique({ where: { id } });
        if (!existing) {
          throw new LedgerError('NOT_FOUND', `Journal entry ${id} not found`);
        }
        throw new LedgerError('STATE', `Journal entry ${id} is not PENDING`);
      }

      const entry = await tx.journalEntry.findUniqueOrThrow({
        where: { id },
        include: { lines: { include: { account: true } } },
      });

      // Re-validate the stored lines before touching balances. Throwing here
      // rolls the whole transaction back, including the status flip.
      const normalized = this.validateJournal(
        entry.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
        })),
      );

      const accountsById = new Map(entry.lines.map((line) => [line.accountId, line.account]));

      for (const line of normalized) {
        if (line.debit.isZero() && line.credit.isZero()) continue;

        const account = accountsById.get(line.accountId);
        if (!account) {
          throw new LedgerError('NOT_FOUND', `Account ${line.accountId} not found`);
        }

        const delta = isDebitNormal(account.type)
          ? line.debit.minus(line.credit)
          : line.credit.minus(line.debit);

        await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: delta } },
        });
      }

      return tx.journalEntry.findUniqueOrThrow({
        where: { id },
        include: { lines: { include: { account: true } } },
      });
    });
  }

  /**
   * Trial balance: every account routed to its debit or credit column based on
   * its normal balance. Negative balances are shown on the opposite side.
   */
  async getTrialBalance() {
    const accounts = await this.db.account.findMany({ orderBy: { code: 'asc' } });

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const rows = accounts.map((account) => {
      const balance = new Prisma.Decimal(account.balance);
      const debitNormal = isDebitNormal(account.type);

      let debit = new Prisma.Decimal(0);
      let credit = new Prisma.Decimal(0);

      if (debitNormal) {
        if (balance.isNegative()) credit = balance.abs();
        else debit = balance;
      } else if (balance.isNegative()) {
        debit = balance.abs();
      } else {
        credit = balance;
      }

      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);

      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        isSystem: account.isSystem,
        debit: money(debit),
        credit: money(credit),
        balance: money(balance),
      };
    });

    return {
      accounts: rows,
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
      balanced: totalDebit.equals(totalCredit),
    };
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  async getProfitAndLoss(range: ReportRange = {}) {
    const from = range.from ? parseDate(range.from, 'from date') : undefined;
    const to = range.to ? parseDate(range.to, 'to date') : undefined;

    const lines = await this.db.journalLine.findMany({
      where: { journalEntry: this.postedWhere(from, to) },
      include: { account: true },
    });

    const aggregates = this.aggregateByAccount(lines);

    const revenue: Array<{ accountId: string; account: string; amount: string }> = [];
    const expenses: Array<{ accountId: string; account: string; amount: string }> = [];
    let totalRevenue = new Prisma.Decimal(0);
    let totalExpenses = new Prisma.Decimal(0);

    for (const aggregate of aggregates.values()) {
      if (aggregate.type === 'REVENUE') {
        const amount = aggregate.credit.minus(aggregate.debit);
        if (!amount.isZero()) {
          revenue.push({
            accountId: aggregate.accountId,
            account: aggregate.name,
            amount: money(amount),
          });
          totalRevenue = totalRevenue.plus(amount);
        }
      } else if (aggregate.type === 'EXPENSE') {
        const amount = aggregate.debit.minus(aggregate.credit);
        if (!amount.isZero()) {
          expenses.push({
            accountId: aggregate.accountId,
            account: aggregate.name,
            amount: money(amount),
          });
          totalExpenses = totalExpenses.plus(amount);
        }
      }
    }

    const byName = (a: { account: string }, b: { account: string }) =>
      a.account.localeCompare(b.account);
    revenue.sort(byName);
    expenses.sort(byName);

    const netIncome = totalRevenue.minus(totalExpenses);

    return {
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      revenue,
      expenses,
      totalRevenue: money(totalRevenue),
      totalExpenses: money(totalExpenses),
      netIncome: money(netIncome),
    };
  }

  async getBalanceSheet(asOfInput?: string | Date) {
    const asOf = parseDate(asOfInput, 'asOf date');

    const lines = await this.db.journalLine.findMany({
      where: { journalEntry: { status: 'POSTED', date: { lte: asOf } } },
      include: { account: true },
    });

    const aggregates = this.aggregateByAccount(lines);

    const assets: Array<{ accountId: string; account: string; amount: string }> = [];
    const liabilities: Array<{ accountId: string; account: string; amount: string }> = [];
    const equity: Array<{ accountId: string; account: string; amount: string }> = [];

    let totalAssets = new Prisma.Decimal(0);
    let totalLiabilities = new Prisma.Decimal(0);
    let totalEquity = new Prisma.Decimal(0);
    let totalRevenue = new Prisma.Decimal(0);
    let totalExpenses = new Prisma.Decimal(0);

    const push = (
      list: typeof assets,
      accountId: string,
      account: string,
      amount: Prisma.Decimal,
    ) => {
      if (!amount.isZero()) list.push({ accountId, account, amount: money(amount) });
    };

    for (const aggregate of aggregates.values()) {
      switch (aggregate.type) {
        case 'ASSET': {
          const amount = aggregate.debit.minus(aggregate.credit);
          push(assets, aggregate.accountId, aggregate.name, amount);
          totalAssets = totalAssets.plus(amount);
          break;
        }
        case 'LIABILITY': {
          const amount = aggregate.credit.minus(aggregate.debit);
          push(liabilities, aggregate.accountId, aggregate.name, amount);
          totalLiabilities = totalLiabilities.plus(amount);
          break;
        }
        case 'EQUITY': {
          const amount = aggregate.credit.minus(aggregate.debit);
          push(equity, aggregate.accountId, aggregate.name, amount);
          totalEquity = totalEquity.plus(amount);
          break;
        }
        case 'REVENUE':
          totalRevenue = totalRevenue.plus(aggregate.credit.minus(aggregate.debit));
          break;
        case 'EXPENSE':
          totalExpenses = totalExpenses.plus(aggregate.debit.minus(aggregate.credit));
          break;
      }
    }

    const byName = (a: { account: string }, b: { account: string }) =>
      a.account.localeCompare(b.account);
    assets.sort(byName);
    liabilities.sort(byName);
    equity.sort(byName);

    const netIncome = totalRevenue.minus(totalExpenses);
    const liabilitiesAndEquity = totalLiabilities.plus(totalEquity).plus(netIncome);

    return {
      asOf: asOf.toISOString(),
      assets: { accounts: assets, total: money(totalAssets) },
      liabilities: { accounts: liabilities, total: money(totalLiabilities) },
      equity: { accounts: equity, total: money(totalEquity) },
      netIncome: money(netIncome),
      totalLiabilitiesAndEquity: money(liabilitiesAndEquity),
      balanced: totalAssets.equals(liabilitiesAndEquity),
    };
  }

  async getGeneralLedger(query: GeneralLedgerQuery = {}) {
    const status = query.status ?? 'POSTED';
    if (status !== 'PENDING' && status !== 'POSTED') {
      throw new LedgerError('VALIDATION', `Invalid journal status ${status}`);
    }

    const from = query.from ? parseDate(query.from, 'from date') : undefined;
    const to = query.to ? parseDate(query.to, 'to date') : undefined;

    const where: Prisma.JournalLineWhereInput = {
      journalEntry: this.postedWhere(from, to, status),
    };
    if (query.accountId) where.accountId = query.accountId;

    const lines = await this.db.journalLine.findMany({
      where,
      include: { account: true, journalEntry: true },
      orderBy: [{ journalEntry: { date: 'asc' } }, { id: 'asc' }],
    });

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const entries = lines.map((line) => {
      totalDebit = totalDebit.plus(line.debit);
      totalCredit = totalCredit.plus(line.credit);

      return {
        journalLineId: line.id,
        journalEntryId: line.journalEntryId,
        date: line.journalEntry.date.toISOString(),
        memo: line.journalEntry.memo,
        status: line.journalEntry.status,
        accountId: line.accountId,
        account: line.account.name,
        accountType: line.account.type,
        debit: money(line.debit),
        credit: money(line.credit),
      };
    });

    return {
      entries,
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private postedWhere(
    from: Date | undefined,
    to: Date | undefined,
    status: JournalStatus = 'POSTED',
  ): Prisma.JournalEntryWhereInput {
    const where: Prisma.JournalEntryWhereInput = { status };
    if (from || to) {
      const date: Prisma.DateTimeFilter = {};
      if (from) date.gte = from;
      if (to) date.lte = to;
      where.date = date;
    }
    return where;
  }

  private aggregateByAccount(
    lines: Array<{
      accountId: string;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      account: { name: string; type: string };
    }>,
  ): Map<string, AccountAggregate> {
    const aggregates = new Map<string, AccountAggregate>();

    for (const line of lines) {
      let aggregate = aggregates.get(line.accountId);
      if (!aggregate) {
        aggregate = {
          accountId: line.accountId,
          name: line.account.name,
          type: line.account.type,
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(0),
        };
        aggregates.set(line.accountId, aggregate);
      }
      aggregate.debit = aggregate.debit.plus(line.debit);
      aggregate.credit = aggregate.credit.plus(line.credit);
    }

    return aggregates;
  }
}

export const ledgerEngine = new LedgerEngine();

/** A ledger client confined to one company (for request handlers). */
export const ledgerFor = (companyId: string): LedgerEngine =>
  new LedgerEngine(companyPrisma(companyId));
