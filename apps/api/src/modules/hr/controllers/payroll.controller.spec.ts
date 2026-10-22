import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { PayrollController } from './payroll.controller';
import { PayrollService } from '../services/payroll.service';
import { PayslipPdfService } from '../services/payslip-pdf.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

describe('PayrollController', () => {
  let controller: PayrollController;
  let payrollService: {
    createPayrollRun: jest.Mock;
    getPayrollRuns: jest.Mock;
    getPayrollRun: jest.Mock;
    calculatePayroll: jest.Mock;
    approvePayrollRun: jest.Mock;
    getPayslipsByEmployee: jest.Mock;
    getPayslip: jest.Mock;
    bulkDelete: jest.Mock;
    deletePayrollRun: jest.Mock;
  };
  let payslipPdfService: {
    generatePayslipPdf: jest.Mock;
  };

  const mockOrgId = 'org-test-123';
  const mockPayslipId = 'payslip-test-456';
  const mockPdfBuffer = Buffer.from('%PDF-1.4 test mock payslip pdf');

  const mockRes = {
    set: jest.fn(),
    send: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    payrollService = {
      createPayrollRun: jest.fn(),
      getPayrollRuns: jest.fn(),
      getPayrollRun: jest.fn(),
      calculatePayroll: jest.fn(),
      approvePayrollRun: jest.fn(),
      getPayslipsByEmployee: jest.fn(),
      getPayslip: jest.fn(),
      bulkDelete: jest.fn(),
      deletePayrollRun: jest.fn(),
    };

    payslipPdfService = {
      generatePayslipPdf: jest.fn().mockResolvedValue(mockPdfBuffer),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollController],
      providers: [
        { provide: PayrollService, useValue: payrollService },
        { provide: PayslipPdfService, useValue: payslipPdfService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollController>(PayrollController);
    jest.clearAllMocks();
  });

  describe('getPayslipPdf', () => {
    it('generates a PDF buffer and sets attachment headers', async () => {
      await controller.getPayslipPdf(mockOrgId, mockPayslipId, 'en', mockRes);

      expect(payslipPdfService.generatePayslipPdf).toHaveBeenCalledWith(
        mockOrgId,
        mockPayslipId,
        'en',
      );
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payslip-${mockPayslipId}.pdf"`,
        'Content-Length': mockPdfBuffer.length,
      });
      expect(mockRes.send).toHaveBeenCalledWith(mockPdfBuffer);
    });

    it('passes Arabic language parameter when requested', async () => {
      await controller.getPayslipPdf(mockOrgId, mockPayslipId, 'ar', mockRes);

      expect(payslipPdfService.generatePayslipPdf).toHaveBeenCalledWith(
        mockOrgId,
        mockPayslipId,
        'ar',
      );
      expect(mockRes.send).toHaveBeenCalledWith(mockPdfBuffer);
    });
  });
});
