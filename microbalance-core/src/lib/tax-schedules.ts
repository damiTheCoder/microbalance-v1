/**
 * Deterministic statutory schedules for the Nigerian tax portals.
 *
 * PAYE follows the LIRS monthly employer schedule, VAT follows the NRS
 * return layout, and WHT follows the deduction schedule. Each generator
 * queries the tenant-scoped data for one period and writes a file under
 * `./tmp/`, returning its absolute path.
 *
 * The payroll engine only stores run totals, so the PAYE schedule rebuilds
 * each employee's line with the same formula the engine used. A reconciliation
 * row is appended when the recomputed lines no longer agree with the run
 * totals (for example, after a salary change).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { LedgerError } from '../engine/errors.js';
import { companyPrisma } from './tenancy.js';

const TMP_DIR = path.resolve(process.cwd(), 'tmp');

const assertPeriod = (month: number, year: number): void => {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new LedgerError('VALIDATION', 'month must be between 1 and 12');
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new LedgerError('VALIDATION', 'year must be between 2000 and 2100');
  }
};

const periodLabel = (month: number, year: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

const monthRange = (month: number, year: number): { gte: Date; lt: Date } => ({
  gte: new Date(year, month - 1, 1),
  lt: new Date(year, month, 1),
});

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

/** Mirrors ErpService.computePaye; kept local so the payroll engine is untouched. */
const computePaye = (annualGross: Prisma.Decimal): Prisma.Decimal => {
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
};

const moneyFormat = '#,##0.00';

const companyNameOf = async (
  db: ReturnType<typeof companyPrisma>,
  companyId: string,
): Promise<string> => {
  const profile = await db.businessProfile.findFirst();
  if (profile?.name) return profile.name;
  const company = await db.company.findUnique({ where: { id: companyId } });
  return company?.name ?? 'Company';
};

const saveWorkbook = async (
  workbook: ExcelJS.Workbook,
  filename: string,
): Promise<string> => {
  await mkdir(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, filename);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
};

/**
 * LIRS PAYE schedule: one row per active employee, with the run totals as the
 * declared remittance baseline.
 */
export async function generateLirsPayeSchedule(
  companyId: string,
  month: number,
  year: number,
): Promise<string> {
  assertPeriod(month, year);
  const db = companyPrisma(companyId);
  const monthKey = String(month).padStart(2, '0');

  const run = await db.payrollRun.findFirst({ where: { month: monthKey, year } });
  if (!run) {
    throw new LedgerError('NOT_FOUND', `No payroll run for ${monthKey}/${year}`);
  }

  const [companyName, employees] = await Promise.all([
    companyNameOf(db, companyId),
    db.employee.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  const rows = employees.map((employee) => {
    const gross = new Prisma.Decimal(employee.basicSalary)
      .plus(employee.housingAllowance)
      .plus(employee.transportAllowance);
    const pension = gross.times('0.08').toDecimalPlaces(2);
    const nhf = new Prisma.Decimal(employee.basicSalary).times('0.025').toDecimalPlaces(2);
    const paye = computePaye(gross.times(12)).div(12).toDecimalPlaces(2);
    const net = gross.minus(pension).minus(nhf).minus(paye);
    return { name: employee.name, gross, pension, nhf, paye, net };
  });

  const sum = (pick: (row: (typeof rows)[number]) => Prisma.Decimal): Prisma.Decimal =>
    rows.reduce((total, row) => total.plus(pick(row)), new Prisma.Decimal(0));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MicroBalance';
  const sheet = workbook.addWorksheet('PAYE Schedule');

  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = companyName;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = 'LIRS Monthly PAYE Schedule';
  sheet.getCell('A2').font = { bold: true, size: 12 };

  sheet.getCell('A3').value = 'Period';
  sheet.getCell('B3').value = periodLabel(month, year);
  sheet.getCell('A4').value = 'Generated';
  sheet.getCell('B4').value = new Date().toISOString().slice(0, 10);

  const headerRow = sheet.getRow(6);
  headerRow.values = [
    'S/N',
    'Employee Name',
    'TIN / NIN',
    'Gross Income',
    'Pension (8%)',
    'NHF (2.5%)',
    'PAYE',
    'Net Pay',
  ];
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.alignment = { vertical: 'middle' };
  });

  rows.forEach((row, index) => {
    const sheetRow = sheet.addRow([
      index + 1,
      row.name,
      '',
      Number(row.gross.toFixed(2)),
      Number(row.pension.toFixed(2)),
      Number(row.nhf.toFixed(2)),
      Number(row.paye.toFixed(2)),
      Number(row.net.toFixed(2)),
    ]);
    [4, 5, 6, 7, 8].forEach((column) => {
      sheetRow.getCell(column).numFmt = moneyFormat;
    });
  });

  const totalRow = sheet.addRow([
    '',
    'Total',
    '',
    Number(sum((row) => row.gross).toFixed(2)),
    Number(sum((row) => row.pension).toFixed(2)),
    Number(sum((row) => row.nhf).toFixed(2)),
    Number(sum((row) => row.paye).toFixed(2)),
    Number(sum((row) => row.net).toFixed(2)),
  ]);
  totalRow.font = { bold: true };
  [4, 5, 6, 7, 8].forEach((column) => {
    totalRow.getCell(column).numFmt = moneyFormat;
  });

  const declared = [
    run.totalGross,
    run.totalPension,
    run.totalNhf,
    run.totalPaye,
    run.totalNet,
  ].map((value) => Number(new Prisma.Decimal(value).toFixed(2)));
  const computed = [4, 5, 6, 7, 8].map((column) =>
    Number(new Prisma.Decimal(totalRow.getCell(column).value as number).toFixed(2)),
  );
  if (declared.some((value, index) => value !== computed[index])) {
    sheet.addRow([]);
    sheet.addRow([
      'Reconciliation',
      `Payroll run totals: gross ${declared[0]}, pension ${declared[1]}, ` +
        `NHF ${declared[2]}, PAYE ${declared[3]}, net ${declared[4]}.`,
    ]);
    sheet.mergeCells(`B${sheet.rowCount}:H${sheet.rowCount}`);
  }

  sheet.columns.forEach((column, index) => {
    column.width = [6, 30, 18, 16, 16, 14, 16, 16][index] ?? 14;
  });
  sheet.views = [{ state: 'frozen', ySplit: 6 }];

  return saveWorkbook(workbook, `paye-schedule-${companyId}-${periodLabel(month, year)}.xlsx`);
}

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * NRS VAT return: output VAT from sales invoices and input VAT from purchase
 * bills. MicroBalance does not record VAT on bills, so input lines are absent
 * and report zero.
 */
export async function generateVatSchedule(
  companyId: string,
  month: number,
  year: number,
): Promise<string> {
  assertPeriod(month, year);
  const db = companyPrisma(companyId);
  const range = monthRange(month, year);

  const [companyName, invoices] = await Promise.all([
    companyNameOf(db, companyId),
    db.salesInvoice.findMany({
      where: { date: range },
      include: { customer: true, lines: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const rows = invoices.map((invoice) => {
    const taxable = invoice.lines.reduce(
      (sum, line) => sum.plus(line.total),
      new Prisma.Decimal(0),
    );
    const vat = new Prisma.Decimal(invoice.totalAmount).minus(taxable);
    return {
      date: isoDate(invoice.date),
      number: invoice.invoiceNumber,
      party: invoice.customer.name,
      taxable,
      vat,
    };
  });

  const taxableTotal = rows.reduce(
    (sum, row) => sum.plus(row.taxable),
    new Prisma.Decimal(0),
  );
  const vatTotal = rows.reduce((sum, row) => sum.plus(row.vat), new Prisma.Decimal(0));

  const lines: string[] = [
    ['VAT Return', companyName].map(csvCell).join(','),
    ['Period', periodLabel(month, year)].map(csvCell).join(','),
    ['Generated', new Date().toISOString()].map(csvCell).join(','),
    '',
    [
      'Transaction Type',
      'Invoice Date',
      'Invoice Number',
      'Customer / Vendor Name',
      'TIN',
      'Taxable Amount',
      'VAT Amount',
    ].map(csvCell).join(','),
    ...rows.map((row) =>
      [
        'Output VAT',
        row.date,
        row.number,
        row.party,
        '',
        row.taxable.toFixed(2),
        row.vat.toFixed(2),
      ].map(csvCell).join(','),
    ),
    '',
    ['TOTAL OUTPUT', '', '', '', '', taxableTotal.toFixed(2), vatTotal.toFixed(2)]
      .map(csvCell)
      .join(','),
    ['TOTAL INPUT', '', '', '', '', '0.00', '0.00'].map(csvCell).join(','),
    ['NET VAT PAYABLE', '', '', '', '', '', vatTotal.toFixed(2)].map(csvCell).join(','),
    '',
  ];

  await mkdir(TMP_DIR, { recursive: true });
  const filePath = path.join(
    TMP_DIR,
    `vat-schedule-${companyId}-${periodLabel(month, year)}.csv`,
  );
  await writeFile(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

/** WHT deduction schedule: every purchase bill that withheld tax in the period. */
export async function generateWhtSchedule(
  companyId: string,
  month: number,
  year: number,
): Promise<string> {
  assertPeriod(month, year);
  const db = companyPrisma(companyId);
  const range = monthRange(month, year);

  const [companyName, bills] = await Promise.all([
    companyNameOf(db, companyId),
    db.purchaseBill.findMany({
      where: { date: range, whtAmount: { gt: 0 } },
      include: { vendor: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MicroBalance';
  const sheet = workbook.addWorksheet('WHT Schedule');

  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = companyName;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = 'Withholding Tax Schedule';
  sheet.getCell('A2').font = { bold: true, size: 12 };

  sheet.getCell('A3').value = 'Period';
  sheet.getCell('B3').value = periodLabel(month, year);
  sheet.getCell('A4').value = 'Generated';
  sheet.getCell('B4').value = new Date().toISOString().slice(0, 10);

  const headerRow = sheet.getRow(6);
  headerRow.values = [
    'Vendor Name',
    'Vendor TIN',
    'Bill Number',
    'Gross Amount',
    'WHT Rate (%)',
    'WHT Amount',
  ];
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });

  let grossTotal = new Prisma.Decimal(0);
  let whtTotal = new Prisma.Decimal(0);

  for (const bill of bills) {
    const gross = new Prisma.Decimal(bill.totalAmount);
    const wht = new Prisma.Decimal(bill.whtAmount);
    grossTotal = grossTotal.plus(gross);
    whtTotal = whtTotal.plus(wht);
    const sheetRow = sheet.addRow([
      bill.vendor.name,
      '',
      bill.billNumber,
      Number(gross.toFixed(2)),
      Number(new Prisma.Decimal(bill.whtRate).toFixed(2)),
      Number(wht.toFixed(2)),
    ]);
    sheetRow.getCell(4).numFmt = moneyFormat;
    sheetRow.getCell(5).numFmt = '0.00';
    sheetRow.getCell(6).numFmt = moneyFormat;
  }

  const totalRow = sheet.addRow([
    'Total',
    '',
    '',
    Number(grossTotal.toFixed(2)),
    '',
    Number(whtTotal.toFixed(2)),
  ]);
  totalRow.font = { bold: true };
  totalRow.getCell(4).numFmt = moneyFormat;
  totalRow.getCell(6).numFmt = moneyFormat;

  sheet.columns.forEach((column, index) => {
    column.width = [32, 18, 16, 16, 14, 16][index] ?? 14;
  });
  sheet.views = [{ state: 'frozen', ySplit: 6 }];

  return saveWorkbook(workbook, `wht-schedule-${companyId}-${periodLabel(month, year)}.xlsx`);
}
