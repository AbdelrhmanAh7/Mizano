import { Test, TestingModule } from '@nestjs/testing';
import { VatReturnDraftService } from './vat-return-draft.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('VatReturnDraftService', () => {
  let service: VatReturnDraftService;
  let prisma: {
    organization: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    invoice: { findMany: jest.Mock };
    bill: { findMany: jest.Mock };
    vATReturn: { findMany: jest.Mock };
    auditLog: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
      invoice: { findMany: jest.fn() },
      bill: { findMany: jest.fn() },
      vATReturn: { findMany: jest.fn() },
      auditLog: { create: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VatReturnDraftService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<VatReturnDraftService>(VatReturnDraftService);
  });

  describe('getDraft', () => {
    it('throws NotFoundException if organization does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.getDraft('org-1', '2024-01-01', '2024-01-31')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('computes VAT draft, flags foreign currency exception, and records audit event', async () => {
      prisma.organization.findUnique.mockResolvedValue({ currency: 'EGP' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          taxAmount: new Decimal('140.0000'),
          currencyCode: 'EGP',
        },
        {
          id: 'inv-2',
          invoiceNumber: 'INV-002',
          taxAmount: new Decimal('20.0000'),
          currencyCode: 'USD', // Foreign currency exception
        },
      ]);

      prisma.bill.findMany.mockResolvedValue([
        {
          id: 'bill-1',
          billNumber: 'BILL-001',
          taxAmount: new Decimal('50.0000'),
          currencyCode: 'EGP',
        },
      ]);

      const draft = await service.getDraft('org-1', '2024-01-01', '2024-01-31', 'user-1');

      expect(draft.status).toBe('incomplete');
      expect(draft.outputTax).toBe('140.0000');
      expect(draft.inputTax).toBe('50.0000');
      expect(draft.netPayable).toBe('90.0000');
      expect(draft.exceptions).toHaveLength(1);
      expect(draft.exceptions[0].id).toBe('inv-2');

      // Verified AuditLog event creation
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'user-1',
            entityType: 'VAT_RETURN_DRAFT_EVENT',
            newValues: expect.objectContaining({
              status: 'incomplete',
              exceptionCount: 1,
            }),
          }),
        }),
      );
    });
  });

  describe('recordCorrection', () => {
    it('records VAT_RETURN_CORRECTION_EVENT in AuditLog', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

      const res = await service.recordCorrection('org-1', 'user-1', {
        period: '2024-01',
        reason: 'omitted_invoice',
      });

      expect(res).toEqual({ success: true, period: '2024-01' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'user-1',
            entityType: 'VAT_RETURN_CORRECTION_EVENT',
            newValues: {
              period: '2024-01',
              reason: 'omitted_invoice',
            },
          }),
        }),
      );
    });
  });

  describe('getFilingCorrectionsMetric', () => {
    it('returns "no data" when no filed VAT returns exist', async () => {
      prisma.vATReturn.findMany.mockResolvedValue([]);

      const metric = await service.getFilingCorrectionsMetric('org-1');

      expect(metric.hasData).toBe(false);
      expect(metric.status).toBe('no data');
      expect(metric.filedPeriodsCount).toBe(0);
      expect(metric.withDraft.filedPeriods).toBe(0);
      expect(metric.withoutDraft.filedPeriods).toBe(0);
      expect(metric.comparison.reductionRate).toBeNull();
    });

    it('calculates reduction metrics across draft-assisted and unassisted cohorts', async () => {
      prisma.vATReturn.findMany.mockResolvedValue([
        {
          id: 'ret-1',
          period: '2024-01',
          filedAt: new Date('2024-02-15T10:00:00Z'),
          status: 'FILED',
        },
        {
          id: 'ret-2',
          period: '2024-02',
          filedAt: new Date('2024-03-15T10:00:00Z'),
          status: 'FILED',
        },
        {
          id: 'ret-3',
          period: '2024-03',
          filedAt: new Date('2024-04-15T10:00:00Z'),
          status: 'FILED',
        },
      ]);

      prisma.auditLog.findMany.mockImplementation(
        ({ where }: { where: { entityType: string } }) => {
          if (where.entityType === 'VAT_RETURN_DRAFT_EVENT') {
            return Promise.resolve([
              {
                entityType: 'VAT_RETURN_DRAFT_EVENT',
                createdAt: new Date('2024-02-10T10:00:00Z'), // Prior to ret-1 filing
                newValues: { period: '2024-01', status: 'complete' },
              },
              {
                entityType: 'VAT_RETURN_DRAFT_EVENT',
                createdAt: new Date('2024-03-10T10:00:00Z'), // Prior to ret-2 filing
                newValues: { period: '2024-02', status: 'incomplete' },
              },
            ]);
          }
          if (where.entityType === 'VAT_RETURN_CORRECTION_EVENT') {
            return Promise.resolve([
              {
                entityType: 'VAT_RETURN_CORRECTION_EVENT',
                newValues: { period: '2024-02' },
              },
              {
                entityType: 'VAT_RETURN_CORRECTION_EVENT',
                newValues: { period: '2024-03' },
              },
              {
                entityType: 'VAT_RETURN_CORRECTION_EVENT',
                newValues: { period: '2024-03' },
              },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const metric = await service.getFilingCorrectionsMetric('org-1');

      expect(metric.hasData).toBe(true);
      expect(metric.status).toBe('active');
      expect(metric.filedPeriodsCount).toBe(3);

      expect(metric.withDraft.filedPeriods).toBe(2);
      expect(metric.withDraft.correctionsCount).toBe(1);
      expect(metric.withDraft.correctionRate).toBe('0.5000');
      expect(metric.withDraft.completeDraftCount).toBe(1);
      expect(metric.withDraft.incompleteDraftCount).toBe(1);

      expect(metric.withoutDraft.filedPeriods).toBe(1);
      expect(metric.withoutDraft.correctionsCount).toBe(2);
      expect(metric.withoutDraft.correctionRate).toBe('2.0000');

      expect(metric.comparison.reductionRate).toBe('1.5000');
      expect(metric.comparison.reductionPercentage).toBe('75.00%');
    });
  });
});
