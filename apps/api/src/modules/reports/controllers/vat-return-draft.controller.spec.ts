import { Test, TestingModule } from '@nestjs/testing';
import { VatReturnDraftController } from './vat-return-draft.controller';
import { VatReturnDraftService } from '../services/vat-return-draft.service';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

describe('VatReturnDraftController', () => {
  let controller: VatReturnDraftController;
  let service: {
    getDraft: jest.Mock;
    recordCorrection: jest.Mock;
    getFilingCorrectionsMetric: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getDraft: jest.fn(),
      recordCorrection: jest.fn(),
      getFilingCorrectionsMetric: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VatReturnDraftController],
      providers: [
        { provide: VatReturnDraftService, useValue: service },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<VatReturnDraftController>(VatReturnDraftController);
  });

  describe('getVatReturnDraft', () => {
    it('throws BadRequestException if from date is after to date', () => {
      expect(() =>
        controller.getVatReturnDraft('org-1', 'user-1', {
          from: '2024-02-01',
          to: '2024-01-01',
        }),
      ).toThrow(BadRequestException);
    });

    it('delegates to service.getDraft when dates are valid', async () => {
      const mockResult = {
        from: '2024-01-01T00:00:00.000Z',
        to: '2024-01-31T00:00:00.000Z',
        status: 'complete',
        outputTax: '100.0000',
        inputTax: '50.0000',
        netPayable: '50.0000',
        exceptions: [],
      };
      service.getDraft.mockResolvedValue(mockResult);

      const res = await controller.getVatReturnDraft('org-1', 'user-1', {
        from: '2024-01-01',
        to: '2024-01-31',
      });

      expect(res).toBe(mockResult);
      expect(service.getDraft).toHaveBeenCalledWith('org-1', '2024-01-01', '2024-01-31', 'user-1');
    });
  });

  describe('recordCorrection', () => {
    it('delegates to service.recordCorrection', async () => {
      service.recordCorrection.mockResolvedValue({ success: true, period: '2024-01' });

      const res = await controller.recordCorrection('org-1', 'user-1', {
        period: '2024-01',
        reason: 'rate_correction',
      });

      expect(res).toEqual({ success: true, period: '2024-01' });
      expect(service.recordCorrection).toHaveBeenCalledWith('org-1', 'user-1', {
        period: '2024-01',
        reason: 'rate_correction',
      });
    });
  });

  describe('getFilingCorrectionsMetric', () => {
    it('delegates to service.getFilingCorrectionsMetric', async () => {
      const mockMetric = {
        status: 'no data',
        hasData: false,
        message: 'No filed VAT return periods found for organization',
        filedPeriodsCount: 0,
        withDraft: { filedPeriods: 0, correctionsCount: 0, correctionRate: null },
        withoutDraft: { filedPeriods: 0, correctionsCount: 0, correctionRate: null },
        comparison: { reductionRate: null, reductionPercentage: null },
      };
      service.getFilingCorrectionsMetric.mockResolvedValue(mockMetric);

      const res = await controller.getFilingCorrectionsMetric('org-1');

      expect(res).toBe(mockMetric);
      expect(service.getFilingCorrectionsMetric).toHaveBeenCalledWith('org-1');
    });
  });
});
