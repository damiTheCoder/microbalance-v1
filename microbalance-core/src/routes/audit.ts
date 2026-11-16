import type { FastifyInstance } from 'fastify';
import { companyPrisma } from '../lib/tenancy.js';
import { LedgerError } from '../engine/errors.js';

/**
 * Auditor export: a single JSON file with the company's ledger, sub-ledgers,
 * and the full audit trail.
 */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audit/export', async (request, reply) => {
    const companyId = request.companyId;
    if (!companyId) throw new LedgerError('VALIDATION', 'Company is required');
    const db = companyPrisma(companyId);

    const [company, accounts, journals, auditLog, customers, vendors, invoices, bills] =
      await Promise.all([
        db.company.findUnique({ where: { id: companyId } }),
        db.account.findMany({ orderBy: { code: 'asc' } }),
        db.journalEntry.findMany({
          include: { lines: { include: { account: true } } },
          orderBy: { date: 'asc' },
        }),
        db.auditLog.findMany({ orderBy: { createdAt: 'asc' } }),
        db.customer.findMany({ orderBy: { name: 'asc' } }),
        db.vendor.findMany({ orderBy: { name: 'asc' } }),
        db.salesInvoice.findMany({
          include: { lines: true, customer: true },
          orderBy: { date: 'asc' },
        }),
        db.purchaseBill.findMany({
          include: { lines: true, vendor: true },
          orderBy: { date: 'asc' },
        }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      companyId,
      company,
      ledger: { accounts, journals },
      sales: { customers, invoices },
      purchases: { vendors, bills },
      auditLog,
    };

    return reply
      .type('application/json')
      .header(
        'content-disposition',
        `attachment; filename="microbalance-audit-${companyId}-${new Date().toISOString().slice(0, 10)}.json"`,
      )
      .send(JSON.stringify(payload, null, 2));
  });
}
