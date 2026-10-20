import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollService } from '../services/payroll.service';
import { PayslipsController } from './payslips.controller';

describe('PayslipsController', () => {
  const pdf = Buffer.from('%PDF-1.4 test');
  let service: { generatePayslipPdf: jest.Mock };
  let controller: PayslipsController;

  beforeEach(() => {
    service = { generatePayslipPdf: jest.fn().mockResolvedValue(pdf) };
    controller = new PayslipsController(service as unknown as PayrollService);
  });

  it('POST /payslips/:id/payslip generates and streams PDF as attachment', async () => {
    const res = { set: jest.fn(), send: jest.fn() };
    await controller.generatePayslip('org-1', 'ps-1', 'en', res as never);

    expect(service.generatePayslipPdf).toHaveBeenCalledWith('org-1', 'ps-1', 'en');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="payslip-ps-1.pdf"',
        'Cache-Control': 'private, no-store',
      }),
    );
    expect(res.send).toHaveBeenCalledWith(pdf);
  });

  it('GET /payslips/:id/pdf streams the PDF as a private, uncached attachment', async () => {
    const res = { set: jest.fn(), send: jest.fn() };
    await controller.getPdf('org-1', 'ps-1', 'en', res as never);

    expect(service.generatePayslipPdf).toHaveBeenCalledWith('org-1', 'ps-1', 'en');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="payslip-ps-1.pdf"',
        'Cache-Control': 'private, no-store',
      }),
    );
    expect(res.send).toHaveBeenCalledWith(pdf);
  });

  describe('permission with the real PermissionsGuard', () => {
    const contextFor = (handler: (...args: any[]) => any, roleId: string): ExecutionContext =>
      ({
        getHandler: () => handler,
        getClass: () => PayslipsController,
        switchToHttp: () => ({ getRequest: () => ({ user: { roleId } }) }),
      }) as unknown as ExecutionContext;

    const guardFor = (name: string, permissions: { module: string; actions: string[] }[]) =>
      new PermissionsGuard(new Reflector(), {
        role: { findUnique: jest.fn().mockResolvedValue({ name, permissions }) },
      } as unknown as PrismaService);

    it('lets a Manager/Accountant with the default hr.view permission download (no payroll module needed) on POST and GET', async () => {
      const guard = guardFor('Accountant', [{ module: 'hr', actions: ['view'] }]);
      await expect(
        guard.canActivate(contextFor(PayslipsController.prototype.generatePayslip, 'role-acc')),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(contextFor(PayslipsController.prototype.getPdf, 'role-acc')),
      ).resolves.toBe(true);
    });

    it('rejects a role without hr.view with 403 on POST and GET', async () => {
      const guard = guardFor('Sales', [{ module: 'sales', actions: ['view'] }]);
      await expect(
        guard.canActivate(contextFor(PayslipsController.prototype.generatePayslip, 'role-sales')),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        guard.canActivate(contextFor(PayslipsController.prototype.getPdf, 'role-sales')),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
