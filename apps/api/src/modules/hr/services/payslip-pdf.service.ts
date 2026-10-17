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

export function getPinnedFontPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'apps/api/assets/fonts/Amiri-Regular.ttf'),
    path.resolve(process.cwd(), 'assets/fonts/Amiri-Regular.ttf'),
    path.resolve(process.cwd(), 'dist/assets/fonts/Amiri-Regular.ttf'),
    path.resolve(process.cwd(), 'apps/api/dist/assets/fonts/Amiri-Regular.ttf'),
    // src layout (ts-node/jest) and dist layouts (dist/ or dist/src/)
    path.resolve(__dirname, '../../../../assets/fonts/Amiri-Regular.ttf'),
    path.resolve(__dirname, '../../../../../assets/fonts/Amiri-Regular.ttf'),
    path.resolve(__dirname, '../../../assets/fonts/Amiri-Regular.ttf'),
    path.resolve(__dirname, '../../assets/fonts/Amiri-Regular.ttf'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Pinned font file not found');
}

type Doc = InstanceType<typeof import('pdfkit')>;

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

/**
 * Draws "label value" as two separate runs. PDFKit does not run the Unicode bidi algorithm,
 * so mixed Arabic/Latin strings would come out in the wrong visual order. Each run holds a
 * single script (Arabic label, Latin digits/names) and only the run positions are mirrored.
 */
function drawPair(
  doc: Doc,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  isAr: boolean,
): void {
  const gap = 6;
  const labelWidth = doc.widthOfString(label);
  const shownValue = fitText(doc, value, Math.max(width - labelWidth - gap, 0));
  const valueWidth = doc.widthOfString(shownValue);
  if (isAr) {
    doc.text(label, x, y, { width, align: 'right', lineBreak: false });
    doc.text(shownValue, x + width - labelWidth - gap - valueWidth, y, { lineBreak: false });
  } else {
    doc.text(label, x, y, { lineBreak: false });
    doc.text(shownValue, x + labelWidth + gap, y, { lineBreak: false });
  }
}

/** One label/amount row inside a column; label and amount are separate runs, mirrored for Arabic. */
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
    doc.text(shownLabel, colX + colWidth / 2, y, { width: half, align: 'right', lineBreak: false });
    doc.text(amountText, colX + 10, y, { width: half, align: 'left', lineBreak: false });
  } else {
    doc.text(shownLabel, colX + 10, y, { width: half, align: 'left', lineBreak: false });
    doc.text(amountText, colX + colWidth / 2, y, { width: half, align: 'right', lineBreak: false });
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
      doc.text(isAr ? 'مفردات المرتب' : 'PAYSLIP', margin, 40, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
      });

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
      doc.text(orgName, margin, 95, {
        width: contentWidth,
        align: isAr ? 'right' : 'left',
        lineBreak: false,
      });

      // Employee Details Card
      const boxY = 120;
      const innerX = margin + 15;
      const innerWidth = contentWidth - 30;
      doc.rect(margin, boxY, contentWidth, 70).fillAndStroke('#F8FAFC', '#CBD5E1');

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
      let y = 205;
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
      doc.text(isAr ? 'الاستحقاقات' : 'Earnings', earningsX + 10, y + 6, {
        width: colWidth - 20,
        align: isAr ? 'right' : 'left',
        lineBreak: false,
      });
      doc.text(isAr ? 'الاستقطاعات' : 'Deductions', deductionsX + 10, y + 6, {
        width: colWidth - 20,
        align: isAr ? 'right' : 'left',
        lineBreak: false,
      });

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
        doc.text(isAr ? 'لا توجد استقطاعات' : 'No deductions', deductionsX + 10, dedY, {
          width: colWidth - 20,
          align: isAr ? 'right' : 'left',
          lineBreak: false,
        });
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
      if (isAr) {
        doc.text('صافي الراتب المستحق', margin + 30, netY + 16, {
          width: netLabelWidth,
          align: 'right',
          lineBreak: false,
        });
        doc.fontSize(16).text(money(data.netSalary), margin + contentWidth / 2, netY + 14, {
          width: netLabelWidth,
          align: 'left',
          lineBreak: false,
        });
      } else {
        doc.text('NET PAYABLE SALARY', margin + 30, netY + 16, {
          width: netLabelWidth,
          align: 'left',
          lineBreak: false,
        });
        doc.fontSize(16).text(money(data.netSalary), margin + contentWidth / 2, netY + 14, {
          width: netLabelWidth,
          align: 'right',
          lineBreak: false,
        });
      }

      // Footer notice
      doc.fillColor('#94A3B8').fontSize(9);
      const footerNotice = isAr
        ? 'هذه الوثيقة صادرة آلياً من نظام ميزانو ولا تتطلب توقيعاً'
        : 'This is a computer-generated payslip from Mizano and requires no signature';
      doc.text(footerNotice, margin, 740, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
      });

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
      for (const [amount, labelEn, labelAr] of snapshotEarnings) {
        if (amount && !amount.isZero()) {
          earnings.push({ labelEn, labelAr, amount });
        }
      }
      for (const { name, amount } of jsonLines(payslip.allowances)) {
        earnings.push({ labelEn: name, labelAr: name, amount });
      }

      const deductions: RawLine[] = [];
      const snapshotDeductions: Array<[Money | null, string, string]> = [
        [payslip.gosiEmployee, 'Social Insurance', 'التأمينات الاجتماعية'],
        [payslip.incomeTax, 'Income Tax', 'ضريبة الدخل'],
        [payslip.loanDeduction, 'Loan Deduction', 'خصم السلفة'],
        [payslip.otherDeductions, 'Other Deductions', 'استقطاعات أخرى'],
      ];
      for (const [amount, labelEn, labelAr] of snapshotDeductions) {
        if (amount && !amount.isZero()) {
          deductions.push({ labelEn, labelAr, amount });
        }
      }
      for (const { name, amount } of jsonLines(payslip.deductions)) {
        deductions.push({ labelEn: name, labelAr: name, amount });
      }
      if (payslip.taxes && !payslip.taxes.isZero()) {
        deductions.push({ labelEn: 'Tax', labelAr: 'الضريبة', amount: payslip.taxes });
      }

      // Total from the components, never from the `totalDeductions` column (defaults to 0).
      const totalDeductions = deductions.reduce(
        (sum, l) => sum.add(l.amount),
        new Prisma.Decimal(0),
      );

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
