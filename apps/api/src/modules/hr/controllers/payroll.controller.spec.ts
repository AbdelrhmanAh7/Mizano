import { PayrollController } from './payroll.controller';
import { PayrollService } from '../services/payroll.service';

describe('PayrollController - payslip PDF endpoint', () => {
  const pdfBuffer = Buffer.from('%PDF-1.4 test payroll controller pdf');
  let service: { generatePayslipPdf: jest.Mock };
  let controller: PayrollController;

  beforeEach(() => {
    service = {
      generatePayslipPdf: jest.fn().mockResolvedValue(pdfBuffer),
    };
    controller = new PayrollController(service as unknown as PayrollService);
  });

  it('POST /:id/payslip generates a PDF with application/pdf and attachment headers', async () => {
    const res = { set: jest.fn(), send: jest.fn() };
    await controller.generatePayslip('org-1', 'ps-100', 'en', res as never);

    expect(service.generatePayslipPdf).toHaveBeenCalledWith('org-1', 'ps-100', 'en');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="payslip.pdf"',
        'Cache-Control': 'private, no-store',
      }),
    );
    expect(res.send).toHaveBeenCalledWith(pdfBuffer);
  });

  it('POST /:id/payslip defaults to Arabic when lang is not specified', async () => {
    const res = { set: jest.fn(), send: jest.fn() };
    await controller.generatePayslip('org-1', 'ps-100', undefined as never, res as never);

    expect(service.generatePayslipPdf).toHaveBeenCalledWith('org-1', 'ps-100', 'ar');
    expect(res.send).toHaveBeenCalledWith(pdfBuffer);
  });
});
