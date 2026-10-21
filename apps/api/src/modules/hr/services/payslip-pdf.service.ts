import './swc-compat';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import * as bidiModule from 'bidi-js';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollService } from './payroll.service';

export interface PayslipLine {
  labelEn: string;
  labelAr: string;
  /** Exact decimal string, already formatted by `formatDecimal`. */
  amount: string;
}

export interface PayslipPdfData {
  organizationName: string;
  currency: string;
  month: number;
  year: number;
  employee: {
    name: string;
    employeeId: string;
    department?: string | null;
    position?: string | null;
  };
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  grossSalary: string;
  totalDeductions: string;
  netSalary: string;
}

/** Rows per column that fit the single page; the rest are rolled into one "Other" row. */
export const MAX_LINES_PER_COLUMN = 14;

/**
 * Money columns are Decimal(19,4). Render all four stored places, then trim trailing zeros
 * but keep at least two decimals (123.4567 stays, 12345.6000 becomes 12345.60).
 */
export function formatDecimal(value: Prisma.Decimal.Value): string {
  const [whole, fraction = ''] = new Prisma.Decimal(value).toFixed(4).split('.');
  return `${whole}.${fraction.replace(/0+$/, '').padEnd(2, '0')}`;
}

const FONT_FILE = 'assets/fonts/Amiri-Regular.ttf';

/**
 * Where the pinned font can live, most specific first. `dirname` is the compiled/ts module
 * directory: `src/modules/hr/services` (ts-node/jest) or `dist/modules/hr/services` and
 * `dist/src/modules/hr/services` (nest build copies `assets/**` to `dist/assets`, see nest-cli.json).
 */
export function fontCandidates(dirname: string, cwd: string): string[] {
  return [
    path.join(dirname, '..', '..', '..', '..', FONT_FILE),
    path.join(dirname, '..', '..', '..', FONT_FILE),
    path.join(cwd, FONT_FILE),
    path.join(cwd, 'dist', FONT_FILE),
    path.join(cwd, 'apps', 'api', FONT_FILE),
    path.join(cwd, 'apps', 'api', 'dist', FONT_FILE),
  ];
}

export function getPinnedFontPath(dirname = __dirname, cwd = process.cwd()): string {
  const found = fontCandidates(dirname, cwd).find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Pinned font file not found');
  }
  return found;
}

type Doc = InstanceType<typeof import('pdfkit')>;

interface BidiEngine {
  getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl'): { levels: Uint8Array };
}

// bidi-js is a UMD factory: ts-jest (no interop) hands back the function, swc a `{ default }` wrapper.
const bidi: BidiEngine = (
  typeof bidiModule === 'function'
    ? (bidiModule as unknown as () => BidiEngine)
    : (bidiModule as unknown as { default: () => BidiEngine }).default
)();

export interface BidiRun {
  text: string;
  /** Odd embedding level: the run reads right to left. */
  rtl: boolean;
}

/**
 * Splits `text` into direction runs in left-to-right *visual* order (Unicode bidi algorithm,
 * rule L2 applied to whole runs). PDFKit/fontkit only shape and reverse a single run, so mixed
 * Arabic/Latin/digit strings must be ordered here; each returned run holds one direction.
 */
export function visualRuns(text: string, rtl: boolean): BidiRun[] {
  if (!text) {
    return [];
  }
  const { levels } = bidi.getEmbeddingLevels(text, rtl ? 'rtl' : 'ltr');
  const runs: Array<{ text: string; level: number }> = [];
  let from = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || levels[i] !== levels[from]) {
      runs.push({ text: text.slice(from, i), level: levels[from] });
      from = i;
    }
  }
  const maxLevel = Math.max(...runs.map((r) => r.level));
  const oddLevels = runs.map((r) => r.level).filter((l) => l % 2 === 1);
  const minOdd = oddLevels.length ? Math.min(...oddLevels) : maxLevel + 1;
  for (let level = maxLevel; level >= minOdd; level--) {
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].level < level) {
        continue;
      }
      let j = i;
      while (j + 1 < runs.length && runs[j + 1].level >= level) {
        j++;
      }
      const reversed = runs.slice(i, j + 1).reverse();
      runs.splice(i, reversed.length, ...reversed);
      i = j;
    }
  }
  return runs.map((r) => ({ text: r.text, rtl: r.level % 2 === 1 }));
}

/** Truncates with an ellipsis so the text never wraps (and never adds a page). */
function fitText(doc: Doc, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) {
    return text;
  }
  const chars = Array.from(text);
  // Binary search for the longest prefix that fits with the ellipsis (widthOfString is costly)
  let low = 0;
  let high = chars.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (doc.widthOfString(`${chars.slice(0, mid).join('')}…`) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${chars.slice(0, Math.max(low, 1)).join('')}…`;
}

/** Word and single-punctuation tokens: fontkit mis-orders a right-to-left run that mixes both. */
const TOKEN = /[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]/gu;

/** Visual left-to-right pieces of one run: an RTL run is split into tokens and reversed. */
function runPieces(run: BidiRun): string[] {
  return run.rtl ? (run.text.match(TOKEN) ?? []).reverse() : [run.text];
}

/** Draws one line of text as bidi runs placed left to right inside [x, x + width]. */
function drawBidi(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  width: number,
  align: 'left' | 'right' | 'center',
  rtl: boolean,
): void {
  const pieces = visualRuns(text, rtl).flatMap(runPieces);
  const widths = pieces.map((piece) => doc.widthOfString(piece));
  const total = widths.reduce((sum, w) => sum + w, 0);
  let cursor =
    align === 'left' ? x : align === 'right' ? x + width - total : x + (width - total) / 2;
  pieces.forEach((piece, i) => {
    if (piece.trim()) {
      doc.text(piece, cursor, y, { lineBreak: false });
    }
    cursor += widths[i];
  });
}

/** "label value" on one line in the document direction; the value is truncated to fit. */
function drawPair(
  doc: Doc,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  isAr: boolean,
): void {
  const shownValue = fitText(doc, value, Math.max(width - doc.widthOfString(`${label} `), 0));
  drawBidi(doc, `${label} ${shownValue}`, x, y, width, isAr ? 'right' : 'left', isAr);
}

/**
 * One label/amount row inside a column, mirrored for Arabic. The amount is always laid out
 * left-to-right so a leading minus sign and the currency stay attached to the digits.
 */
function drawRow(
  doc: Doc,
  label: string,
  amountText: string,
  colX: number,
  colWidth: number,
  y: number,
  isAr: boolean,
): void {
  const half = colWidth / 2 - 10;
  const shownLabel = fitText(doc, label, half);
  if (isAr) {
    drawBidi(doc, shownLabel, colX + colWidth / 2, y, half, 'right', true);
    drawBidi(doc, amountText, colX + 10, y, half, 'left', false);
  } else {
    drawBidi(doc, shownLabel, colX + 10, y, half, 'left', false);
    drawBidi(doc, amountText, colX + colWidth / 2, y, half, 'right', false);
  }
}

/**
 * Pure rendering function: takes pure payslip data and language,
 * returns deterministic single-page A4 PDF buffer.
 */
export function renderPayslipPdf(data: PayslipPdfData, lang: 'ar' | 'en'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new (PDFDocument as unknown as typeof import('pdfkit'))({
        size: 'A4',
        margin: 40,
        info: {
          CreationDate: new Date(0),
          ModDate: new Date(0),
          Title: 'Payslip',
          Author: 'Mizano',
          Producer: 'Mizano PDF Generator',
        },
      });

      // Fix trailer ID for deterministic byte-identical renders
      (doc as unknown as { _id: Buffer })._id = Buffer.alloc(16, 0);

      const fontPath = getPinnedFontPath();
      doc.registerFont('Amiri', fontPath);
      doc.font('Amiri');

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const isAr = lang === 'ar';
      const pageWidth = 595.28;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;
      const money = (amount: string): string => `${amount} ${data.currency}`;

      // Header Title
      doc.fontSize(20).fillColor('#1E3A8A');
      drawBidi(doc, isAr ? 'مفردات المرتب' : 'PAYSLIP', margin, 40, contentWidth, 'center', isAr);

      // Pay Period
      doc.fontSize(11).fillColor('#64748B');
      drawPair(
        doc,
        isAr ? 'فترة الراتب:' : 'Pay Period:',
        `${data.month}/${data.year}`,
        margin,
        68,
        contentWidth,
        isAr,
      );

      // Organization Name (single line, truncated)
      doc.fontSize(13).fillColor('#0F172A');
      const orgName = fitText(doc, data.organizationName, contentWidth);
      drawBidi(doc, orgName, margin, 95, contentWidth, isAr ? 'right' : 'left', isAr);

      // Employee Details Card
      const boxY = 120;
      const innerX = margin + 15;
      const innerWidth = contentWidth - 30;
      doc.rect(margin, boxY, contentWidth, 78).fillAndStroke('#F8FAFC', '#CBD5E1');

      doc.fillColor('#0F172A').fontSize(10);
      drawPair(
        doc,
        isAr ? 'اسم الموظف:' : 'Employee Name:',
        data.employee.name,
        innerX,
        boxY + 12,
        innerWidth,
        isAr,
      );
      drawPair(
        doc,
        isAr ? 'الرقم الوظيفي:' : 'Employee ID:',
        data.employee.employeeId,
        innerX,
        boxY + 28,
        innerWidth,
        isAr,
      );

      let extraY = boxY + 44;
      if (data.employee.department) {
        drawPair(
          doc,
          isAr ? 'القسم:' : 'Department:',
          data.employee.department,
          innerX,
          extraY,
          innerWidth,
          isAr,
        );
        extraY += 14;
      }
      if (data.employee.position) {
        drawPair(
          doc,
          isAr ? 'المسمى الوظيفي:' : 'Position:',
          data.employee.position,
          innerX,
          extraY,
          innerWidth,
          isAr,
        );
      }

      // Columns for Earnings and Deductions
      let y = 212;
      const colGap = 20;
      const colWidth = (contentWidth - colGap) / 2;
      const leftColX = margin;
      const rightColX = margin + colWidth + colGap;

      const earningsX = isAr ? rightColX : leftColX;
      const deductionsX = isAr ? leftColX : rightColX;

      // Section Headers
      doc.rect(earningsX, y, colWidth, 24).fill('#E2E8F0');
      doc.rect(deductionsX, y, colWidth, 24).fill('#E2E8F0');

      doc.fillColor('#1E3A8A').fontSize(11);
      const headerAlign = isAr ? 'right' : 'left';
      drawBidi(
        doc,
        isAr ? 'الاستحقاقات' : 'Earnings',
        earningsX + 10,
        y + 6,
        colWidth - 20,
        headerAlign,
        isAr,
      );
      drawBidi(
        doc,
        isAr ? 'الاستقطاعات' : 'Deductions',
        deductionsX + 10,
        y + 6,
        colWidth - 20,
        headerAlign,
        isAr,
      );

      y += 32;
      doc.fontSize(10).fillColor('#334155');

      let earnY = y;
      for (const item of data.earnings.slice(0, MAX_LINES_PER_COLUMN)) {
        drawRow(
          doc,
          isAr ? item.labelAr : item.labelEn,
          money(item.amount),
          earningsX,
          colWidth,
          earnY,
          isAr,
        );
        earnY += 20;
      }

      let dedY = y;
      if (data.deductions.length === 0) {
        doc.fillColor('#94A3B8');
        drawBidi(
          doc,
          isAr ? 'لا توجد استقطاعات' : 'No deductions',
          deductionsX + 10,
          dedY,
          colWidth - 20,
          isAr ? 'right' : 'left',
          isAr,
        );
        doc.fillColor('#334155');
        dedY += 20;
      } else {
        for (const item of data.deductions.slice(0, MAX_LINES_PER_COLUMN)) {
          drawRow(
            doc,
            isAr ? item.labelAr : item.labelEn,
            money(item.amount),
            deductionsX,
            colWidth,
            dedY,
            isAr,
          );
          dedY += 20;
        }
      }

      const maxY = Math.max(earnY, dedY, y + 80);

      // Section Subtotals
      const totalY = maxY + 10;
      doc.rect(earningsX, totalY, colWidth, 22).fill('#F1F5F9');
      doc.rect(deductionsX, totalY, colWidth, 22).fill('#F1F5F9');

      doc.fillColor('#0F172A').fontSize(10);
      drawRow(
        doc,
        isAr ? 'إجمالي الراتب' : 'Gross Salary',
        money(data.grossSalary),
        earningsX,
        colWidth,
        totalY + 5,
        isAr,
      );
      drawRow(
        doc,
        isAr ? 'إجمالي الاستقطاعات' : 'Total Deductions',
        money(data.totalDeductions),
        deductionsX,
        colWidth,
        totalY + 5,
        isAr,
      );

      // Net Pay Highlight Card
      const netY = totalY + 45;
      doc.rect(margin, netY, contentWidth, 50).fill('#0F766E');
      doc.fillColor('#FFFFFF').fontSize(12);
      const netLabelWidth = contentWidth / 2 - 40;
      const netLabel = isAr ? 'صافي الراتب المستحق' : 'NET PAYABLE SALARY';
      const netLabelX = margin + (isAr ? contentWidth / 2 : 30);
      const netAmountX = margin + (isAr ? 30 : contentWidth / 2);
      drawBidi(doc, netLabel, netLabelX, netY + 16, netLabelWidth, isAr ? 'right' : 'left', isAr);
      doc.fontSize(16);
      drawBidi(
        doc,
        money(data.netSalary),
        netAmountX,
        netY + 14,
        netLabelWidth,
        isAr ? 'left' : 'right',
        false,
      );

      // Footer notice
      doc.fillColor('#94A3B8').fontSize(9);
      const footerNotice = isAr
        ? 'هذه الوثيقة صادرة آلياً من نظام ميزانو ولا تتطلب توقيعاً'
        : 'This is a computer-generated payslip from Mizano and requires no signature';
      drawBidi(doc, footerNotice, margin, 740, contentWidth, 'center', isAr);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

type Money = Prisma.Decimal;

/** Persisted JSON line items ({ name: amount }) as non-zero decimals; anything else is ignored. */
function jsonLines(json: unknown): Array<{ name: string; amount: Money }> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return [];
  }
  const lines: Array<{ name: string; amount: Money }> = [];
  for (const [name, raw] of Object.entries(json as Record<string, unknown>)) {
    if ((typeof raw === 'number' && Number.isFinite(raw)) || typeof raw === 'string') {
      try {
        const amount = new Prisma.Decimal(String(raw));
        if (!amount.isZero()) {
          lines.push({ name, amount });
        }
      } catch {
        // non-numeric JSON value: not a money line
      }
    }
  }
  return lines;
}

interface RawLine {
  labelEn: string;
  labelAr: string;
  amount: Money;
}

function nonZeroLines(columns: Array<[Money | null, string, string]>): RawLine[] {
  const lines: RawLine[] = [];
  for (const [amount, labelEn, labelAr] of columns) {
    if (amount && !amount.isZero()) {
      lines.push({ labelEn, labelAr, amount });
    }
  }
  return lines;
}

/** Keeps the page single-page: rows past the cap are summed into one "Other" row. */
function capLines(lines: RawLine[], other: { labelEn: string; labelAr: string }): RawLine[] {
  if (lines.length <= MAX_LINES_PER_COLUMN) {
    return lines;
  }
  const kept = lines.slice(0, MAX_LINES_PER_COLUMN - 1);
  const rest = lines
    .slice(MAX_LINES_PER_COLUMN - 1)
    .reduce((sum, l) => sum.add(l.amount), new Prisma.Decimal(0));
  return [...kept, { ...other, amount: rest }];
}

@Injectable()
export class PayslipPdfService {
  private readonly logger = new Logger(PayslipPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollService: PayrollService,
  ) {}

  async generatePayslipPdf(
    organizationId: string,
    payslipId: string,
    langInput?: string,
  ): Promise<Buffer> {
    const lang = langInput ?? 'ar';
    if (lang !== 'ar' && lang !== 'en') {
      throw new BadRequestException(`Unsupported language "${lang}". Supported: "ar", "en"`);
    }

    try {
      // 1. Fetch payslip scoped to organization (handles cross-tenant 404 & soft-deleted employee 404)
      const payslip = await this.payrollService.getPayslip(organizationId, payslipId);

      // 2. Fetch organization info for currency and company name
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, baseCurrency: true, currency: true },
      });

      if (!organization) {
        throw new NotFoundException('Organization not found');
      }

      // 3. Reject only absent data. An exact zero amount is valid (zero-pay or net = 0 payslips).
      const currency = organization.baseCurrency || organization.currency;
      if (!currency) {
        throw new UnprocessableEntityException('Missing required field: currency');
      }
      if (!payslip.employee?.name?.trim()) {
        throw new UnprocessableEntityException('Missing required field: employeeName');
      }
      if (!payslip.employee?.employeeId?.trim()) {
        throw new UnprocessableEntityException('Missing required field: employeeId');
      }
      if (payslip.basicSalary == null) {
        throw new UnprocessableEntityException('Missing required field: basicSalary');
      }
      if (payslip.grossSalary == null) {
        throw new UnprocessableEntityException('Missing required field: grossSalary');
      }
      if (payslip.netSalary == null) {
        throw new UnprocessableEntityException('Missing required field: netSalary');
      }

      // 4. Map the fields payroll actually persists (calculatePayroll writes `lop`, the
      //    `allowances`/`deductions` JSON and `taxes`; the individual columns are optional
      //    snapshots) into line items. No float conversion; Decimal stays Decimal.
      const earnings: RawLine[] = [
        { labelEn: 'Basic Salary', labelAr: 'الراتب الأساسي', amount: payslip.basicSalary },
      ];
      if (payslip.lop && !payslip.lop.isZero()) {
        earnings.push({
          labelEn: 'Loss of Pay',
          labelAr: 'خصم الغياب',
          amount: payslip.lop.negated(),
        });
      }
      const snapshotEarnings: Array<[Money | null, string, string]> = [
        [payslip.housingAllowance, 'Housing Allowance', 'بدل السكن'],
        [payslip.transportAllowance, 'Transport Allowance', 'بدل الانتقال'],
        [payslip.otherAllowances, 'Other Allowances', 'بدلات أخرى'],
        [payslip.overtime, 'Overtime', 'العمل الإضافي'],
        [payslip.bonus, 'Bonus', 'المكافآت'],
      ];
      // The snapshot columns and the JSON hold the same figures (seeded payslips store both);
      // use the columns when set, otherwise the JSON calculatePayroll writes. Never both.
      const earningSnapshot = nonZeroLines(snapshotEarnings);
      earnings.push(
        ...(earningSnapshot.length
          ? earningSnapshot
          : jsonLines(payslip.allowances).map((l) => ({
              labelEn: l.name,
              labelAr: l.name,
              amount: l.amount,
            }))),
      );
      const itemisedEarnings = earnings.reduce(
        (sum, l) => sum.add(l.amount),
        new Prisma.Decimal(0),
      );
      const unexplainedEarnings = payslip.grossSalary.sub(itemisedEarnings);
      if (!unexplainedEarnings.isZero()) {
        earnings.push({
          labelEn: 'Other Earnings',
          labelAr: 'استحقاقات أخرى',
          amount: unexplainedEarnings,
        });
      }

      const deductions: RawLine[] = [];
      const snapshotDeductions: Array<[Money | null, string, string]> = [
        [payslip.gosiEmployee, 'Social Insurance', 'التأمينات الاجتماعية'],
        [payslip.incomeTax, 'Income Tax', 'ضريبة الدخل'],
        [payslip.loanDeduction, 'Loan Deduction', 'خصم السلفة'],
        [payslip.otherDeductions, 'Other Deductions', 'استقطاعات أخرى'],
      ];
      const deductionSnapshot = nonZeroLines(snapshotDeductions);
      // Capture otherDeductions value from the snapshot (last entry) to include in reconciliation
      // without displaying it as a separate line item, avoiding duplicate "Other Deductions" rows.
      const otherDeductionsFromSnapshot =
        payslip.otherDeductions && !payslip.otherDeductions.isZero()
          ? payslip.otherDeductions
          : new Prisma.Decimal(0);
      // Filter out the otherDeductions entry from displayed lines
      const displayDeductions = deductionSnapshot.filter((d) => d.labelEn !== 'Other Deductions');
      deductions.push(
        ...(displayDeductions.length
          ? displayDeductions
          : jsonLines(payslip.deductions).map((l) => ({
              labelEn: l.name,
              labelAr: l.name,
              amount: l.amount,
            }))),
      );
      if (payslip.taxes && !payslip.taxes.isZero()) {
        deductions.push({ labelEn: 'Tax', labelAr: 'الضريبة', amount: payslip.taxes });
      }

      // The stored `totalDeductions` is authoritative when set; calculatePayroll leaves it at its
      // default of 0, so then the total is gross - net. Any part of that total the line items do
      // not explain is shown as one "Other Deductions" row, so the page always reconciles.
      // Include otherDeductionsFromSnapshot in the itemised base so the reconciliation row
      // represents the full unexplained amount in a single line.
      const itemised = deductions.reduce((sum, l) => sum.add(l.amount), new Prisma.Decimal(0));
      const stored = payslip.totalDeductions;
      const calculatedTotal = payslip.grossSalary.sub(payslip.netSalary);
      const totalDeductions =
        stored && !stored.isZero()
          ? stored
          : calculatedTotal.isNegative()
            ? new Prisma.Decimal(0)
            : calculatedTotal;
      const unexplained = totalDeductions.sub(itemised).add(otherDeductionsFromSnapshot);
      if (!unexplained.isZero()) {
        deductions.push({
          labelEn: 'Other Deductions',
          labelAr: 'استقطاعات أخرى',
          amount: unexplained,
        });
      }

      const toLines = (lines: RawLine[]): PayslipLine[] =>
        lines.map((l) => ({
          labelEn: l.labelEn,
          labelAr: l.labelAr,
          amount: formatDecimal(l.amount),
        }));

      const data: PayslipPdfData = {
        organizationName: organization.name,
        currency,
        month: payslip.payrollRun.month,
        year: payslip.payrollRun.year,
        employee: {
          name: payslip.employee.name,
          employeeId: payslip.employee.employeeId,
          department: payslip.employee.department,
          position: payslip.employee.position ?? payslip.employee.jobTitle,
        },
        earnings: toLines(
          capLines(earnings, { labelEn: 'Other Earnings', labelAr: 'استحقاقات أخرى' }),
        ),
        deductions: toLines(
          capLines(deductions, { labelEn: 'Other Deductions', labelAr: 'استقطاعات أخرى' }),
        ),
        grossSalary: formatDecimal(payslip.grossSalary),
        totalDeductions: formatDecimal(totalDeductions),
        netSalary: formatDecimal(payslip.netSalary),
      };

      // 5. Render PDF synchronously without network calls
      return await renderPayslipPdf(data, lang);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      this.logger.error(
        `Payslip PDF generation failed: ${describeError(error, { includeMessage: false })}`,
      );
      throw error;
    }
  }
}
