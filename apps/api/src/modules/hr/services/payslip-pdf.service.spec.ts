import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PayslipPdfData, PayslipPdfService, renderPayslipPdf } from './payslip-pdf.service';
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
    earnings: {
      basicSalary: '12345.60',
      housingAllowance: '1500.50',
      transportAllowance: '500.00',
      grossSalary: '14345.60',
    },
    deductions: {
      gosiEmployee: '1434.56',
      incomeTax: '1200.00',
      totalDeductions: '2634.56',
    },
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
        deductions: {
          totalDeductions: '0.00',
        },
      };
      const bufferEn = await renderPayslipPdf(noDeductionsData, 'en');
      const parsedEn = await parsePdf(bufferEn);
      expect(parsedEn.text).toContain('No deductions');

      const bufferAr = await renderPayslipPdf(noDeductionsData, 'ar');
      const parsedAr = await parsePdf(bufferAr);
      expect(parsedAr.text).toContain('0.00');

      const negativeDeductionsData: PayslipPdfData = {
        ...sampleData,
        deductions: {
          loanDeduction: '-200.00',
          totalDeductions: '-200.00',
        },
      };
      const bufferNeg = await renderPayslipPdf(negativeDeductionsData, 'en');
      const parsedNeg = await parsePdf(bufferNeg);
      expect(parsedNeg.text).toContain('-200.00');
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

    const mockPrismaPayslip = {
      id: payslipId,
      basicSalary: new Prisma.Decimal('12345.60'),
      baseSalary: new Prisma.Decimal('12345.60'),
      housingAllowance: new Prisma.Decimal('1500.50'),
      transportAllowance: new Prisma.Decimal('500.00'),
      otherAllowances: new Prisma.Decimal('0.00'),
      overtime: new Prisma.Decimal('0.00'),
      bonus: new Prisma.Decimal('0.00'),
      grossSalary: new Prisma.Decimal('14345.60'),
      totalDeductions: new Prisma.Decimal('2634.56'),
      netSalary: new Prisma.Decimal('11711.04'),
      gosiEmployee: new Prisma.Decimal('1434.56'),
      incomeTax: new Prisma.Decimal('1200.00'),
      loanDeduction: new Prisma.Decimal('0.00'),
      otherDeductions: new Prisma.Decimal('0.00'),
      employee: {
        name: 'Ahmed Hassan',
        employeeId: 'EMP-001',
        department: 'Finance',
        position: 'Senior Accountant',
        deletedAt: null,
      },
      payrollRun: {
        month: 10,
        year: 2026,
        organizationId: orgId,
      },
    };

    beforeEach(() => {
      mockPrisma = {
        organization: {
          findUnique: jest.fn().mockResolvedValue({
            id: orgId,
            name: 'Mizano SME',
            currency: 'EGP',
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
        select: { name: true, currency: true },
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

    it('throws UnprocessableEntityException when required basicSalary is missing or zero, containing no values in error reason', async () => {
      mockPayrollService.getPayslip.mockResolvedValue({
        ...mockPrismaPayslip,
        basicSalary: new Prisma.Decimal('0.00'),
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
      // Must not contain numeric values or sensitive data
      expect(message).not.toContain('12345');
      expect(message).not.toContain('0.00');
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
      expect(loggedText).not.toContain('secret salary data');
    });
  });
});
