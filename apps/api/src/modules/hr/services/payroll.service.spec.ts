import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollService } from './payroll.service';

describe('PayrollService (payslips cross-tenant scoping)', () => {
  let service: PayrollService;
  let findFirstEmployee: jest.Mock;
  let findManyPayslip: jest.Mock;
  let findFirstPayslip: jest.Mock;

  const orgA = 'org-tenant-a';
  const employeeId = 'emp-123';
  const payslipId = 'ps-456';

  beforeEach(async () => {
    findFirstEmployee = jest.fn();
    findManyPayslip = jest.fn();
    findFirstPayslip = jest.fn();

    const mockPrisma = {
      employee: {
        findFirst: findFirstEmployee,
      },
      payslip: {
        findFirst: findFirstPayslip,
        findMany: findManyPayslip,
      },
      payrollRun: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  describe('getEmployeePayslips', () => {
    it('throws NotFoundException when employee belongs to another organization (cross-tenant 404)', async () => {
      // Employee not found in orgA because they belong to orgB
      findFirstEmployee.mockResolvedValue(null);

      await expect(service.getEmployeePayslips(orgA, employeeId)).rejects.toThrow(
        NotFoundException,
      );

      expect(findFirstEmployee).toHaveBeenCalledWith({
        where: { id: employeeId, organizationId: orgA, deletedAt: null },
        select: { id: true },
      });
      expect(findManyPayslip).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when employee is soft-deleted', async () => {
      findFirstEmployee.mockResolvedValue(null);

      await expect(service.getEmployeePayslips(orgA, employeeId)).rejects.toThrow(
        new NotFoundException('Employee not found'),
      );
    });

    it('returns payslips scoped to caller organization when employee exists in tenant', async () => {
      findFirstEmployee.mockResolvedValue({ id: employeeId });
      const mockPayslips = [
        {
          id: 'ps-1',
          employeeId,
          payrollRun: { month: 1, year: 2026, status: 'PROCESSED' },
        },
      ];
      findManyPayslip.mockResolvedValue(mockPayslips);

      const result = await service.getEmployeePayslips(orgA, employeeId);

      expect(findFirstEmployee).toHaveBeenCalledWith({
        where: { id: employeeId, organizationId: orgA, deletedAt: null },
        select: { id: true },
      });
      expect(findManyPayslip).toHaveBeenCalledWith({
        where: {
          employeeId,
          payrollRun: { organizationId: orgA },
        },
        orderBy: { payrollRun: { year: 'desc' } },
        include: { payrollRun: { select: { month: true, year: true, status: true } } },
      });
      expect(result).toEqual(mockPayslips);
    });
  });

  describe('getPayslip', () => {
    it('throws NotFoundException when payslip belongs to another organization (cross-tenant 404)', async () => {
      // Query scoped by payrollRun: { organizationId: orgA } returns null for orgB payslip
      findFirstPayslip.mockResolvedValue(null);

      await expect(service.getPayslip(orgA, payslipId)).rejects.toThrow(NotFoundException);

      expect(findFirstPayslip).toHaveBeenCalledWith({
        where: { id: payslipId, payrollRun: { organizationId: orgA } },
        include: {
          employee: true,
          payrollRun: true,
        },
      });
    });

    it('returns payslip when it belongs to caller organization', async () => {
      const mockPayslip = {
        id: payslipId,
        payrollRun: { organizationId: orgA },
        employee: { id: employeeId },
      };
      findFirstPayslip.mockResolvedValue(mockPayslip);

      const result = await service.getPayslip(orgA, payslipId);

      expect(findFirstPayslip).toHaveBeenCalledWith({
        where: { id: payslipId, payrollRun: { organizationId: orgA } },
        include: {
          employee: true,
          payrollRun: true,
        },
      });
      expect(result).toEqual(mockPayslip);
    });
  });
});
