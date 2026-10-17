import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  formatDecimal,
  getPinnedFontPath,
  PayslipPdfData,
  PayslipPdfService,
  renderPayslipPdf,
} from './payslip-pdf.service';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../../../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require('pdf-parse');

async function parsePdf(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  const pdfParse = pdfParseModule.default || pdfParseModule;
  if (pdfParseModule.PDFParse && typeof pdfParseModule.PDFParse === 'function') {
    const uint8 = new Uint8Array(buffer);
    const parser = new pdfParseModule.PDFParse(uint8);
    const res = await parser.getText();
    return { text: res.text || '', numpages: res.total || 1 };
  }
  return pdfParse({ data: new Uint8Array(buffer) });
}

describe('PayslipPdfService & renderPayslipPdf', () => {
  const sampleData: PayslipPdfData = {
    organizationName: 'Mizano Egyptian SME Trading SAE',
    currency: 'EGP',
    month: 10,
    year: 2026,
    employee: {
      name: 'Ahmed Hassan',
      employeeId: 'EMP-001',
      department: 'Finance',
      position: 'Senior Accountant',
    },
    earnings: [
      { labelEn: 'Basic Salary', labelAr: 'الراتب الأساسي', amount: '12345.60' },
      { labelEn: 'Housing Allowance', labelAr: 'بدل السكن', amount: '1500.50' },
      { labelEn: 'Transport Allowance', labelAr: 'بدل الانتقال', amount: '500.00' },
    ],
    deductions: [
      { labelEn: 'Social Insurance', labelAr: 'التأمينات الاجتماعية', amount: '1434.56' },
      { labelEn: 'Income Tax', labelAr: 'ضريبة الدخل', amount: '1200.00' },
    ],
    grossSalary: '14345.60',
    totalDeductions: '2634.56',
    netSalary: '11711.04',
  };

  describe('renderPayslipPdf (pure function)', () => {
    it('produces a buffer starting with %PDF', async () => {
      const buffer = await renderPayslipPdf(sampleData, 'en');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('produces byte-identical output across repeated renders of identical input', async () => {
      const buf1 = await renderPayslipPdf(sampleData, 'en');
      const buf2 = await renderPayslipPdf(sampleData, 'en');
      expect(Buffer.compare(buf1, buf2)).toBe(0);

      const ar1 = await renderPayslipPdf(sampleData, 'ar');
      const ar2 = await renderPayslipPdf(sampleData, 'ar');
      expect(Buffer.compare(ar1, ar2)).toBe(0);
    });

    it('renders exact decimal strings without float conversion or rounding (e.g. 12345.60 not 12345.6)', async () => {
      const buffer = await renderPayslipPdf(sampleData, 'en');
      const parsed = await parsePdf(buffer);
      expect(parsed.text).toContain('12345.60');
      expect(parsed.text).toContain('1500.50');
      expect(parsed.text).toContain('14345.60');
      expect(parsed.text).toContain('11711.04');
    });

    it('renders English labels in en mode', async () => {
      const buffer = await renderPayslipPdf(sampleData, 'en');
      const parsed = await parsePdf(buffer);
      expect(parsed.text).toContain('PAYSLIP');
      expect(parsed.text).toContain('Basic Salary');
      expect(parsed.text).toContain('Gross Salary');
      expect(parsed.text).toContain('NET PAYABLE SALARY');
    });

    it('renders Arabic labels and shapes Arabic glyphs in ar mode with RTL alignment', async () => {
      const buffer = await renderPayslipPdf(sampleData, 'ar');
      const parsed = await parsePdf(buffer);
      // Arabic labels extracted from visual stream
      expect(parsed.text).toMatch(/المرتب|الراتب|الأساسي|صافي/);
      expect(parsed.text).toContain('12345.60');
      expect(parsed.text).toContain('11711.04');
    });

    it('strictly caps the page count at 1 page for CPU efficiency on arm64/Pi 5', async () => {
      const bufferEn = await renderPayslipPdf(sampleData, 'en');
      const parsedEn = await parsePdf(bufferEn);
      expect(parsedEn.numpages).toBe(1);

      const bufferAr = await renderPayslipPdf(sampleData, 'ar');
      const parsedAr = await parsePdf(bufferAr);
      expect(parsedAr.numpages).toBe(1);
    });

    it('handles long employee names without crashing or overflowing page boundary', async () => {
      const longNameData: PayslipPdfData = {
        ...sampleData,
        employee: {
          ...sampleData.employee,
          name: 'Abdelrahman Mohamed Ahmed El-Sayed Mostafa Ibrahim Hassan Al-Qurashi',
        },
      };
      const buffer = await renderPayslipPdf(longNameData, 'en');
      const parsed = await parsePdf(buffer);
      expect(parsed.numpages).toBe(1);
      expect(parsed.text).toContain('12345.60');
    });

    it('handles zero or negative deductions without crashing or layout breaks', async () => {
      const noDeductionsData: PayslipPdfData = {
        ...sampleData,
        deductions: [],
        totalDeductions: '0.00',
      };
      const parsedEn = await parsePdf(await renderPayslipPdf(noDeductionsData, 'en'));
      expect(parsedEn.text).toContain('No deductions');
      const parsedAr = await parsePdf(await renderPayslipPdf(noDeductionsData, 'ar'));
      expect(parsedAr.text).toContain('0.00');

      const negativeDeductionsData: PayslipPdfData = {
        ...sampleData,
        deductions: [{ labelEn: 'Loan Deduction', labelAr: 'خصم السلفة', amount: '-200.00' }],
        totalDeductions: '-200.00',
      };
      const parsedNeg = await parsePdf(await renderPayslipPdf(negativeDeductionsData, 'en'));
      expect(parsedNeg.text).toContain('-200.00');
    });

    it('keeps one page for a 500-character organization name and over-long line items', async () => {
      const hugeData: PayslipPdfData = {
        ...sampleData,
        organizationName: 'Mizano '.repeat(72).slice(0, 500),
        employee: {
          ...sampleData.employee,
          name: 'N'.repeat(500),
          department: 'D'.repeat(500),
          position: 'P'.repeat(500),
        },
        earnings: Array.from({ length: 40 }, (_, i) => ({
          labelEn: `Allowance ${'x'.repeat(200)} ${i}`,
          labelAr: `بدل ${'ب'.repeat(200)} ${i}`,
          amount: '1.00',
        })),
      };
      for (const lang of ['en', 'ar'] as const) {
        const parsed = await parsePdf(await renderPayslipPdf(hugeData, lang));
        expect(parsed.numpages).toBe(1);
      }
    });

    it('keeps Arabic labels and Latin numbers as separate runs for a mixed 10/2026 and 123.45 EGP string', async () => {
      const mixed: PayslipPdfData = {
        ...sampleData,
        earnings: [{ labelEn: 'Basic Salary', labelAr: 'الراتب الأساسي', amount: '123.45' }],
      };
      const parsed = await parsePdf(await renderPayslipPdf(mixed, 'ar'));
      // Digits and currency are never split or reversed inside their own run
      expect(parsed.text).toContain('10/2026');
      expect(parsed.text).toContain('123.45 EGP');
      expect(parsed.text).not.toContain('6202/01');
      expect(parsed.text).not.toContain('PGE 54.321');
      // Deterministic
      const again = await parsePdf(await renderPayslipPdf(mixed, 'ar'));
      expect(again.text).toBe(parsed.text);
    });
  });

  describe('formatDecimal', () => {
    it.each([
      ['123.4567', '123.4567'],
      ['12345.6000', '12345.60'],
      ['100', '100.00'],
      ['0', '0.00'],
      ['-200', '-200.00'],
      ['1500.5', '1500.50'],
      ['0.1250', '0.125'],
    ])('formats %s as %s without losing stored decimal places', (input, expected) => {
      expect(formatDecimal(new Prisma.Decimal(input))).toBe(expected);
    });
  });

  describe('PayslipPdfService', () => {
    let service: PayslipPdfService;
    let mockPrisma: {
      organization: { findUnique: jest.Mock };
    };
    let mockPayrollService: {
      getPayslip: jest.Mock;
    };

    const orgId = 'org-123';
    const payslipId = 'ps-456';

    const employee = {
      name: 'Ahmed Hassan',
      employeeId: 'EMP-001',
      department: 'Finance',
      position: 'Senior Accountant',
      deletedAt: null,
    };
    const payrollRun = { month: 10, year: 2026, organizationId: orgId };

    // Snapshot-column payslip (individual columns populated)
    const mockPrismaPayslip = {
      id: payslipId,
      basicSalary: new Prisma.Decimal('12345.60'),
      housingAllowance: new Prisma.Decimal('1500.50'),
      transportAllowance: new Prisma.Decimal('500.00'),
      otherAllowances: new Prisma.Decimal('0.00'),
      overtime: new Prisma.Decimal('0.00'),
      bonus: new Prisma.Decimal('0.00'),
      allowances: {},
      lop: new Prisma.Decimal('0'),
      grossSalary: new Prisma.Decimal('14345.60'),
      totalDeductions: new Prisma.Decimal('2634.56'),
      netSalary: new Prisma.Decimal('11711.04'),
      gosiEmployee: new Prisma.Decimal('1434.56'),
      incomeTax: new Prisma.Decimal('1200.00'),
      loanDeduction: new Prisma.Decimal('0.00'),
      otherDeductions: new Prisma.Decimal('0.00'),
      deductions: {},
      taxes: new Prisma.Decimal('0'),
      employee,
      payrollRun,
    };

    // Payslip exactly as PayrollService.calculatePayroll persists it: allowances/deductions JSON,
    // lop and taxes; totalDeductions and the snapshot columns stay at their schema defaults.
    const calculatedPayslip = {
      id: payslipId,
      basicSalary: new Prisma.Decimal('10000'),
      allowances: { housing: 2000, transport: 500.5 },
      housingAllowance: new Prisma.Decimal('0'),
      transportAllowance: new Prisma.Decimal('0'),
      otherAllowances: new Prisma.Decimal('0'),
      overtime: new Prisma.Decimal('0'),
      bonus: new Prisma.Decimal('0'),
      lop: new Prisma.Decimal('1000.1234'),
      grossSalary: new Prisma.Decimal('11500.3766'),
      deductions: { insurance: 300, loan: 150.25 },
      gosiEmployee: new Prisma.Decimal('0'),
      incomeTax: new Prisma.Decimal('0'),
      loanDeduction: new Prisma.Decimal('0'),
      otherDeductions: new Prisma.Decimal('0'),
      totalDeductions: new Prisma.Decimal('0'),
      taxes: new Prisma.Decimal('575.0188'),
      netSalary: new Prisma.Decimal('10475.1078'),
      employee,
      payrollRun,
    };

    beforeEach(() => {
      mockPrisma = {
        organization: {
          findUnique: jest.fn().mockResolvedValue({
            id: orgId,
            name: 'Mizano SME',
            baseCurrency: 'EGP',
            currency: 'SAR',
          }),
        },
      };

      mockPayrollService = {
        getPayslip: jest.fn().mockResolvedValue(mockPrismaPayslip),
      };

      service = new PayslipPdfService(
        mockPrisma as unknown as PrismaService,
        mockPayrollService as unknown as PayrollService,
      );
    });

    it('generates a valid PDF buffer for an authorized in-organization payslip', async () => {
      const buffer = await service.generatePayslipPdf(orgId, payslipId, 'en');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
      expect(mockPayrollService.getPayslip).toHaveBeenCalledWith(orgId, payslipId);
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: orgId },
        select: { name: true, baseCurrency: true, currency: true },
      });
    });

    it('throws BadRequestException for an unsupported language', async () => {
      await expect(service.generatePayslipPdf(orgId, payslipId, 'de')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPayrollService.getPayslip).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException when payslip does not belong to organization (cross-tenant 404)', async () => {
      mockPayrollService.getPayslip.mockRejectedValue(new NotFoundException('Payslip not found'));
      await expect(service.generatePayslipPdf(orgId, payslipId, 'ar')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when organization is not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.generatePayslipPdf(orgId, payslipId, 'ar')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException with a value-free reason when basicSalary is absent', async () => {
      mockPayrollService.getPayslip.mockResolvedValue({
        ...mockPrismaPayslip,
        basicSalary: null,
      });

      let caughtError: unknown;
      try {
        await service.generatePayslipPdf(orgId, payslipId, 'ar');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(UnprocessableEntityException);
      const message = (caughtError as UnprocessableEntityException).message;
      expect(message).toContain('Missing required field: basicSalary');
      expect(message).not.toContain('12345');
    });

    it('renders a zero-pay payslip (loss of pay equals basic salary) with 200-equivalent output', async () => {
      mockPayrollService.getPayslip.mockResolvedValue({
        ...calculatedPayslip,
        basicSalary: new Prisma.Decimal('5000'),
        allowances: {},
        deductions: {},
        lop: new Prisma.Decimal('5000'),
        grossSalary: new Prisma.Decimal('0'),
        taxes: new Prisma.Decimal('0'),
        netSalary: new Prisma.Decimal('0'),
      });
      const parsed = await parsePdf(await service.generatePayslipPdf(orgId, payslipId, 'en'));
      expect(parsed.text).toContain('Loss of Pay');
      expect(parsed.text).toContain('-5000.00 EGP');
      expect(parsed.text).toContain('0.00 EGP');
    });

    it('renders a net = 0 payslip when deductions equal gross', async () => {
      mockPayrollService.getPayslip.mockResolvedValue({
        ...mockPrismaPayslip,
        grossSalary: new Prisma.Decimal('1000'),
        netSalary: new Prisma.Decimal('0'),
        gosiEmployee: new Prisma.Decimal('1000'),
        incomeTax: new Prisma.Decimal('0'),
      });
      const buffer = await service.generatePayslipPdf(orgId, payslipId, 'ar');
      expect(buffer.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('maps the fields calculatePayroll persists so net = gross - deductions reconciles', async () => {
      mockPayrollService.getPayslip.mockResolvedValue(calculatedPayslip);
      const parsed = await parsePdf(await service.generatePayslipPdf(orgId, payslipId, 'en'));
      const text = parsed.text;
      // earnings: basic, loss of pay, JSON allowances
      expect(text).toContain('10000.00 EGP');
      expect(text).toContain('-1000.1234 EGP');
      expect(text).toContain('2000.00 EGP');
      expect(text).toContain('500.50 EGP');
      // deductions: JSON deductions + taxes; total is derived (300 + 150.25 + 575.0188), not the 0 column
      expect(text).toContain('300.00 EGP');
      expect(text).toContain('150.25 EGP');
      expect(text).toContain('575.0188 EGP');
      expect(text).toContain('1025.2688 EGP');
      expect(text).toContain('11500.3766 EGP');
      expect(text).toContain('10475.1078 EGP');
      // 11500.3766 - 1025.2688 = 10475.1078
      expect(
        calculatedPayslip.grossSalary
          .minus(new Prisma.Decimal('300').plus('150.25').plus('575.0188'))
          .toFixed(4),
      ).toBe(calculatedPayslip.netSalary.toFixed(4));
    });

    it('preserves a four-decimal stored amount (123.4567 is not rounded to 123.46)', async () => {
      mockPayrollService.getPayslip.mockResolvedValue({
        ...mockPrismaPayslip,
        basicSalary: new Prisma.Decimal('123.4567'),
      });
      const parsed = await parsePdf(await service.generatePayslipPdf(orgId, payslipId, 'en'));
      expect(parsed.text).toContain('123.4567 EGP');
      expect(parsed.text).not.toContain('123.46 EGP');
    });

    it('labels amounts with baseCurrency and falls back to the legacy currency only when it is null', async () => {
      const en = await parsePdf(await service.generatePayslipPdf(orgId, payslipId, 'en'));
      expect(en.text).toContain('12345.60 EGP');
      expect(en.text).not.toContain('SAR');

      mockPrisma.organization.findUnique.mockResolvedValue({
        name: 'Legacy Org',
        baseCurrency: null,
        currency: 'SAR',
      });
      const legacy = await parsePdf(await service.generatePayslipPdf(orgId, payslipId, 'en'));
      expect(legacy.text).toContain('12345.60 SAR');
    });

    it('throws UnprocessableEntityException when employee name is missing', async () => {
      mockPayrollService.getPayslip.mockResolvedValue({
        ...mockPrismaPayslip,
        employee: {
          ...mockPrismaPayslip.employee,
          name: '',
        },
      });

      await expect(service.generatePayslipPdf(orgId, payslipId, 'ar')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('logs only the exception type name and no raw message or payslip payload on render error', async () => {
      const loggerSpy = jest.spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );

      // Force an error in organization query
      const thrownError = new TypeError(
        'Simulated unexpected render failure with secret salary data 99999',
      );
      mockPrisma.organization.findUnique.mockRejectedValue(thrownError);

      await expect(service.generatePayslipPdf(orgId, payslipId, 'ar')).rejects.toThrow(TypeError);

      expect(loggerSpy).toHaveBeenCalled();
      const loggedText = loggerSpy.mock.calls[0][0];
      // Assert it logs only the error name and no raw message containing secret data
      expect(loggedText).toContain('TypeError');
      expect(loggedText).not.toContain('Simulated unexpected render failure');
      expect(loggedText).not.toContain('99999');
    });

    describe('getPinnedFontPath', () => {
      it('resolves an existing font file on disk', () => {
        const fontPath = getPinnedFontPath();
        expect(typeof fontPath).toBe('string');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        expect(fs.existsSync(fontPath)).toBe(true);
        expect(fontPath).toMatch(/Amiri-Regular\.ttf$/);
      });
    });
  });
});
