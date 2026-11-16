import PDFDocument from 'pdfkit';
import { prisma } from './prisma.js';
import { ledgerFor } from '../engine/LedgerEngine.js';

export type ReportType = 'PROFIT_AND_LOSS' | 'BALANCE_SHEET' | 'TRIAL_BALANCE';

const TITLES: Record<ReportType, string> = {
  PROFIT_AND_LOSS: 'Profit and Loss',
  BALANCE_SHEET: 'Balance Sheet',
  TRIAL_BALANCE: 'Trial Balance',
};

const money = (value: string | number | null | undefined): string => {
  const amount = Number(value ?? 0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}₦${Math.abs(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface Row {
  label: string;
  amount?: string;
  bold?: boolean;
}

/** Build a branded PDF for one financial statement. */
export async function generatePdfReport(companyId: string, reportType: ReportType): Promise<Buffer> {
  const profile = await prisma.businessProfile.findFirst({ where: { companyId } });
  const ledger = ledgerFor(companyId);
  const rows: Row[] = [];
  let subtitle = '';

  if (reportType === 'PROFIT_AND_LOSS') {
    const report = await ledger.getProfitAndLoss({});
    subtitle = 'For the period to date';
    rows.push({ label: 'Revenue', bold: true });
    for (const line of report.revenue) rows.push({ label: `  ${line.account}`, amount: money(line.amount) });
    rows.push({ label: 'Total revenue', amount: money(report.totalRevenue), bold: true });
    rows.push({ label: '', amount: '' });
    rows.push({ label: 'Expenses', bold: true });
    for (const line of report.expenses) rows.push({ label: `  ${line.account}`, amount: money(line.amount) });
    rows.push({ label: 'Total expenses', amount: money(report.totalExpenses), bold: true });
    rows.push({ label: 'Net income', amount: money(report.netIncome), bold: true });
  } else if (reportType === 'BALANCE_SHEET') {
    const report = await ledger.getBalanceSheet();
    subtitle = `As at ${new Date(report.asOf).toLocaleDateString('en-NG')}`;
    rows.push({ label: 'Assets', bold: true });
    for (const line of report.assets.accounts) rows.push({ label: `  ${line.account}`, amount: money(line.amount) });
    rows.push({ label: 'Total assets', amount: money(report.assets.total), bold: true });
    rows.push({ label: '', amount: '' });
    rows.push({ label: 'Liabilities', bold: true });
    for (const line of report.liabilities.accounts) rows.push({ label: `  ${line.account}`, amount: money(line.amount) });
    rows.push({ label: 'Total liabilities', amount: money(report.liabilities.total), bold: true });
    rows.push({ label: 'Equity', bold: true });
    for (const line of report.equity.accounts) rows.push({ label: `  ${line.account}`, amount: money(line.amount) });
    rows.push({ label: 'Net income', amount: money(report.netIncome) });
    rows.push({ label: 'Total liabilities and equity', amount: money(report.totalLiabilitiesAndEquity), bold: true });
  } else {
    const report = await ledger.getTrialBalance();
    subtitle = 'All accounts, debit and credit';
    rows.push({ label: 'Account', amount: 'Debit / Credit', bold: true });
    for (const line of report.accounts) {
      const amount = Number(line.balance);
      rows.push({
        label: `${line.code} · ${line.name}`,
        amount: amount === 0 ? '—' : amount > 0 ? `${money(amount)} Dr` : `${money(Math.abs(amount))} Cr`,
      });
    }
    rows.push({ label: 'Totals', amount: `${money(report.totalDebit)} / ${money(report.totalCredit)}`, bold: true });
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 54 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const blue = '#2563eb';
    doc.fillColor(blue).fontSize(20).font('Helvetica-Bold').text('MicroBalance');
    doc.moveDown(0.2);
    doc.fillColor('#111111').fontSize(16).text(TITLES[reportType]);
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
      .text(profile?.name !== undefined && profile.name !== '' ? profile.name : 'Company');
    doc.text(subtitle);
    doc.moveDown(1);
    doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(54, doc.y).lineTo(541, doc.y).stroke();
    doc.moveDown(0.8);

    for (const row of rows) {
      if (row.label === '' && row.amount === undefined) {
        doc.moveDown(0.5);
        continue;
      }
      const y = doc.y;
      doc.font(row.bold === true ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
        .fillColor(row.bold === true ? '#111111' : '#374151')
        .text(row.label, 54, y, { width: 340, lineBreak: false });
      if (row.amount !== undefined) {
        doc.font(row.bold === true ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.amount, 400, y, { width: 141, align: 'right' });
      }
      doc.moveDown(0.6);
      if (doc.y > 760) {
        doc.addPage();
        doc.moveDown(1);
      }
    }

    doc.fontSize(8).fillColor('#9ca3af')
      .text(`Generated by MicroBalance · ${new Date().toLocaleString('en-NG')}`, 54, 780, {
        width: 487,
        align: 'center',
      });
    doc.end();
  });
}
