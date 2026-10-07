import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollService } from './payroll.service';

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
  earnings: {
    basicSalary: string;
    housingAllowance?: string | null;
    transportAllowance?: string | null;
    otherAllowances?: string | null;
    overtime?: string | null;
    bonus?: string | null;
    grossSalary: string;
  };
  deductions: {
    gosiEmployee?: string | null;
    incomeTax?: string | null;
    loanDeduction?: string | null;
    otherDeductions?: string | null;
    totalDeductions?: string | null;
  };
  netSalary: string;
}

export function getPinnedFontPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'apps/api/assets/fonts/Amiri-Regular.ttf'),
    path.resolve(process.cwd(), 'assets/fonts/Amiri-Regular.ttf'),
    path.resolve(__dirname, '../../../../assets/fonts/Amiri-Regular.ttf'),
    path.resolve(__dirname, '../../../../../assets/fonts/Amiri-Regular.ttf'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Pinned font file not found');
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

      // Header Title
      doc.fontSize(20).fillColor('#1E3A8A');
      doc.text(isAr ? 'مفردات المرتب' : 'PAYSLIP', margin, 40, {
        width: contentWidth,
        align: 'center',
      });

      // Pay Period
      doc.fontSize(11).fillColor('#64748B');
      const periodLabel = isAr
        ? `فترة الراتب: ${data.month}/${data.year}`
        : `Pay Period: ${data.month}/${data.year}`;
      doc.text(periodLabel, margin, 68, { width: contentWidth, align: 'center' });

      // Organization Name
      doc.fontSize(13).fillColor('#0F172A');
      doc.text(data.organizationName, margin, 95, {
        width: contentWidth,
        align: isAr ? 'right' : 'left',
      });

      // Employee Details Card
      const boxY = 120;
      doc.rect(margin, boxY, contentWidth, 70).fillAndStroke('#F8FAFC', '#CBD5E1');

      doc.fillColor('#0F172A').fontSize(10);
      const nameText = isAr
        ? `اسم الموظف: ${data.employee.name}`
        : `Employee Name: ${data.employee.name}`;
      const idText = isAr
        ? `الرقم الوظيفي: ${data.employee.employeeId}`
        : `Employee ID: ${data.employee.employeeId}`;

      doc.text(nameText, margin + 15, boxY + 12, {
        width: contentWidth - 30,
        align: isAr ? 'right' : 'left',
        ellipsis: true,
      });
      doc.text(idText, margin + 15, boxY + 28, {
        width: contentWidth - 30,
        align: isAr ? 'right' : 'left',
      });

      if (data.employee.department || data.employee.position) {
        const extraText = isAr
          ? [
              data.employee.department ? `القسم: ${data.employee.department}` : '',
              data.employee.position ? `المسمى الوظيفي: ${data.employee.position}` : '',
            ]
              .filter(Boolean)
              .join(' | ')
          : [
              data.employee.department ? `Department: ${data.employee.department}` : '',
              data.employee.position ? `Position: ${data.employee.position}` : '',
            ]
              .filter(Boolean)
              .join(' | ');

        doc.text(extraText, margin + 15, boxY + 44, {
          width: contentWidth - 30,
          align: isAr ? 'right' : 'left',
          ellipsis: true,
        });
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
      });
      doc.text(isAr ? 'الاستقطاعات' : 'Deductions', deductionsX + 10, y + 6, {
        width: colWidth - 20,
        align: isAr ? 'right' : 'left',
      });

      y += 32;
      doc.fontSize(10).fillColor('#334155');

      // Earnings Line Items
      const earnings: Array<{ label: string; amount: string }> = [
        { label: isAr ? 'الراتب الأساسي' : 'Basic Salary', amount: data.earnings.basicSalary },
      ];
      if (data.earnings.housingAllowance) {
        earnings.push({
          label: isAr ? 'بدل السكن' : 'Housing Allowance',
          amount: data.earnings.housingAllowance,
        });
      }
      if (data.earnings.transportAllowance) {
        earnings.push({
          label: isAr ? 'بدل الانتقال' : 'Transport Allowance',
          amount: data.earnings.transportAllowance,
        });
      }
      if (data.earnings.otherAllowances) {
        earnings.push({
          label: isAr ? 'بدلات أخرى' : 'Other Allowances',
          amount: data.earnings.otherAllowances,
        });
      }
      if (data.earnings.overtime) {
        earnings.push({
          label: isAr ? 'العمل الإضافي' : 'Overtime',
          amount: data.earnings.overtime,
        });
      }
      if (data.earnings.bonus) {
        earnings.push({
          label: isAr ? 'المكافآت' : 'Bonus',
          amount: data.earnings.bonus,
        });
      }

      // Deductions Line Items
      const deductions: Array<{ label: string; amount: string }> = [];
      if (data.deductions.gosiEmployee) {
        deductions.push({
          label: isAr ? 'التأمينات الاجتماعية' : 'Social Insurance',
          amount: data.deductions.gosiEmployee,
        });
      }
      if (data.deductions.incomeTax) {
        deductions.push({
          label: isAr ? 'ضريبة الدخل' : 'Income Tax',
          amount: data.deductions.incomeTax,
        });
      }
      if (data.deductions.loanDeduction) {
        deductions.push({
          label: isAr ? 'خصم السلفة' : 'Loan Deduction',
          amount: data.deductions.loanDeduction,
        });
      }
      if (data.deductions.otherDeductions) {
        deductions.push({
          label: isAr ? 'استقطاعات أخرى' : 'Other Deductions',
          amount: data.deductions.otherDeductions,
        });
      }

      let earnY = y;
      for (const item of earnings) {
        if (isAr) {
          doc.text(item.label, earningsX + colWidth / 2, earnY, {
            width: colWidth / 2 - 10,
            align: 'right',
          });
          doc.text(`${item.amount} ${data.currency}`, earningsX + 10, earnY, {
            width: colWidth / 2 - 10,
            align: 'left',
          });
        } else {
          doc.text(item.label, earningsX + 10, earnY, {
            width: colWidth / 2 - 10,
            align: 'left',
          });
          doc.text(`${item.amount} ${data.currency}`, earningsX + colWidth / 2, earnY, {
            width: colWidth / 2 - 10,
            align: 'right',
          });
        }
        earnY += 20;
      }

      let dedY = y;
      if (deductions.length === 0) {
        doc.fillColor('#94A3B8');
        doc.text(isAr ? 'لا توجد استقطاعات' : 'No deductions', deductionsX + 10, dedY, {
          width: colWidth - 20,
          align: isAr ? 'right' : 'left',
        });
        doc.fillColor('#334155');
        dedY += 20;
      } else {
        for (const item of deductions) {
          if (isAr) {
            doc.text(item.label, deductionsX + colWidth / 2, dedY, {
              width: colWidth / 2 - 10,
              align: 'right',
            });
            doc.text(`${item.amount} ${data.currency}`, deductionsX + 10, dedY, {
              width: colWidth / 2 - 10,
              align: 'left',
            });
          } else {
            doc.text(item.label, deductionsX + 10, dedY, {
              width: colWidth / 2 - 10,
              align: 'left',
            });
            doc.text(`${item.amount} ${data.currency}`, deductionsX + colWidth / 2, dedY, {
              width: colWidth / 2 - 10,
              align: 'right',
            });
          }
          dedY += 20;
        }
      }

      const maxY = Math.max(earnY, dedY, y + 80);

      // Section Subtotals
      const totalY = maxY + 10;
      doc.rect(earningsX, totalY, colWidth, 22).fill('#F1F5F9');
      doc.rect(deductionsX, totalY, colWidth, 22).fill('#F1F5F9');

      doc.fillColor('#0F172A').fontSize(10);
      if (isAr) {
        doc.text('إجمالي الراتب', earningsX + colWidth / 2, totalY + 5, {
          width: colWidth / 2 - 10,
          align: 'right',
        });
        doc.text(`${data.earnings.grossSalary} ${data.currency}`, earningsX + 10, totalY + 5, {
          width: colWidth / 2 - 10,
          align: 'left',
        });

        doc.text('إجمالي الاستقطاعات', deductionsX + colWidth / 2, totalY + 5, {
          width: colWidth / 2 - 10,
          align: 'right',
        });
        doc.text(
          `${data.deductions.totalDeductions || '0.00'} ${data.currency}`,
          deductionsX + 10,
          totalY + 5,
          { width: colWidth / 2 - 10, align: 'left' },
        );
      } else {
        doc.text('Gross Salary', earningsX + 10, totalY + 5, {
          width: colWidth / 2 - 10,
          align: 'left',
        });
        doc.text(
          `${data.earnings.grossSalary} ${data.currency}`,
          earningsX + colWidth / 2,
          totalY + 5,
          { width: colWidth / 2 - 10, align: 'right' },
        );

        doc.text('Total Deductions', deductionsX + 10, totalY + 5, {
          width: colWidth / 2 - 10,
          align: 'left',
        });
        doc.text(
          `${data.deductions.totalDeductions || '0.00'} ${data.currency}`,
          deductionsX + colWidth / 2,
          totalY + 5,
          { width: colWidth / 2 - 10, align: 'right' },
        );
      }

      // Net Pay Highlight Card
      const netY = totalY + 45;
      doc.rect(margin, netY, contentWidth, 50).fill('#0F766E');
      doc.fillColor('#FFFFFF').fontSize(12);
      if (isAr) {
        doc.text('صافي الراتب المستحق', margin + 30, netY + 16, {
          width: contentWidth / 2 - 40,
          align: 'right',
        });
        doc
          .fontSize(16)
          .text(`${data.netSalary} ${data.currency}`, margin + contentWidth / 2, netY + 14, {
            width: contentWidth / 2 - 40,
            align: 'left',
          });
      } else {
        doc.text('NET PAYABLE SALARY', margin + 30, netY + 16, {
          width: contentWidth / 2 - 40,
          align: 'left',
        });
        doc
          .fontSize(16)
          .text(`${data.netSalary} ${data.currency}`, margin + contentWidth / 2, netY + 14, {
            width: contentWidth / 2 - 40,
            align: 'right',
          });
      }

      // Footer notice
      doc.fillColor('#94A3B8').fontSize(9);
      const footerNotice = isAr
        ? 'هذه الوثيقة صادرة آلياً من نظام ميزانو ولا تتطلب توقيعاً'
        : 'This is a computer-generated payslip from Mizano and requires no signature';
      doc.text(footerNotice, margin, 740, { width: contentWidth, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
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
        select: { name: true, currency: true },
      });

      if (!organization) {
        throw new NotFoundException('Organization not found');
      }

      // 3. Validate required fields (throw 422 if any required field is missing or zero)
      if (!organization.currency) {
        throw new UnprocessableEntityException('Missing required field: currency');
      }
      if (!payslip.employee?.name?.trim()) {
        throw new UnprocessableEntityException('Missing required field: employeeName');
      }
      if (!payslip.employee?.employeeId?.trim()) {
        throw new UnprocessableEntityException('Missing required field: employeeId');
      }
      if (!payslip.basicSalary || payslip.basicSalary.isZero()) {
        throw new UnprocessableEntityException('Missing required field: basicSalary');
      }
      if (!payslip.grossSalary || payslip.grossSalary.isZero()) {
        throw new UnprocessableEntityException('Missing required field: grossSalary');
      }
      if (!payslip.netSalary || payslip.netSalary.isZero()) {
        throw new UnprocessableEntityException('Missing required field: netSalary');
      }

      // 4. Extract exact decimal strings without float conversion or rounding
      const basicSalaryStr = payslip.basicSalary.toFixed(2);
      const grossSalaryStr = payslip.grossSalary.toFixed(2);
      const netSalaryStr = payslip.netSalary.toFixed(2);

      const housingAllowanceStr =
        payslip.housingAllowance && !payslip.housingAllowance.isZero()
          ? payslip.housingAllowance.toFixed(2)
          : undefined;

      const transportAllowanceStr =
        payslip.transportAllowance && !payslip.transportAllowance.isZero()
          ? payslip.transportAllowance.toFixed(2)
          : undefined;

      const otherAllowancesStr =
        payslip.otherAllowances && !payslip.otherAllowances.isZero()
          ? payslip.otherAllowances.toFixed(2)
          : undefined;

      const overtimeStr =
        payslip.overtime && !payslip.overtime.isZero() ? payslip.overtime.toFixed(2) : undefined;

      const bonusStr =
        payslip.bonus && !payslip.bonus.isZero() ? payslip.bonus.toFixed(2) : undefined;

      const gosiEmployeeStr =
        payslip.gosiEmployee && !payslip.gosiEmployee.isZero()
          ? payslip.gosiEmployee.toFixed(2)
          : undefined;

      const incomeTaxStr =
        payslip.incomeTax && !payslip.incomeTax.isZero() ? payslip.incomeTax.toFixed(2) : undefined;

      const loanDeductionStr =
        payslip.loanDeduction && !payslip.loanDeduction.isZero()
          ? payslip.loanDeduction.toFixed(2)
          : undefined;

      const otherDeductionsStr =
        payslip.otherDeductions && !payslip.otherDeductions.isZero()
          ? payslip.otherDeductions.toFixed(2)
          : undefined;

      const totalDeductionsStr = payslip.totalDeductions
        ? payslip.totalDeductions.toFixed(2)
        : '0.00';

      const data: PayslipPdfData = {
        organizationName: organization.name,
        currency: organization.currency,
        month: payslip.payrollRun.month,
        year: payslip.payrollRun.year,
        employee: {
          name: payslip.employee.name,
          employeeId: payslip.employee.employeeId,
          department: payslip.employee.department,
          position: payslip.employee.position ?? payslip.employee.jobTitle,
        },
        earnings: {
          basicSalary: basicSalaryStr,
          housingAllowance: housingAllowanceStr,
          transportAllowance: transportAllowanceStr,
          otherAllowances: otherAllowancesStr,
          overtime: overtimeStr,
          bonus: bonusStr,
          grossSalary: grossSalaryStr,
        },
        deductions: {
          gosiEmployee: gosiEmployeeStr,
          incomeTax: incomeTaxStr,
          loanDeduction: loanDeductionStr,
          otherDeductions: otherDeductionsStr,
          totalDeductions: totalDeductionsStr,
        },
        netSalary: netSalaryStr,
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
