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
      account: { count: jest.fn() },
      journalLine: { findMany: jest.fn(), aggregate: jest.fn() },
      vATReturn: { findMany: jest.fn() },
      auditLog: { create: jest.fn(), findMany: jest.fn() },
    } as any;

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

    it('computes VAT draft from posted journal movements and records audit event', async () => {
      prisma.organization.findUnique.mockResolvedValue({ currency: 'EGP' });
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.account.count.mockResolvedValue(2); // Both payable and receivable accounts exist

      // Mock VAT accounts resolution
      prisma.journalLine.findMany.mockResolvedValue([]);

      // Mock VAT figures computation
      prisma.journalLine.aggregate
        .mockResolvedValueOnce({ _sum: { debit: new Decimal('100'), credit: new Decimal('200') } })
        .mockResolvedValueOnce({ _sum: { debit: new Decimal('50'), credit: new Decimal('50') } })
        .mockResolvedValueOnce({ _sum: { debit: new Decimal('0'), credit: new Decimal('0') } })
        .mockResolvedValueOnce({ _sum: { debit: new Decimal('0'), credit: new Decimal('0') } });

      const draft = await service.getDraft('org-1', '2024-01-01', '2024-01-31', 'user-1');

      expect(draft.status).toBe('complete');
      expect(draft.outputTax).toBe('100.0000');
      expect(draft.inputTax).toBe('50.0000');
      expect(draft.netPayable).toBe('50.0000');
      expect(draft.exceptions).toHaveLength(0);

      // Verify AuditLog event creation
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'user-1',
            entityType: 'VAT_RETURN_DRAFT_EVENT',
            newValues: expect.objectContaining({
              status: 'complete',
              exceptionCount: 0,
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
        reason: 'omitted_invoice_adjustment',
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
              reason: 'omitted_invoice_adjustment',
            },
          }),
        }),
      );
    });

    it('is idempotent across retries using the same reason', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

      // First call succeeds
      const res1 = await service.recordCorrection('org-1', 'user-1', {
        period: '2024-01',
        reason: 'tax_rate_error',
      });

      expect(res1).toEqual({ success: true, period: '2024-01' });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);

      // Second call with same reason is a retry; should succeed without duplicate row
      const res2 = await service.recordCorrection('org-1', 'user-1', {
        period: '2024-01',
        reason: 'tax_rate_error',
      });

      expect(res2).toEqual({ success: true, period: '2024-01' });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1); // Still only 1 row
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
