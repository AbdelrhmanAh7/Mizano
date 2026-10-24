import { BadRequestException } from '@nestjs/common';
import { VatReturnDraftController } from './vat-return-draft.controller';
import { VatReturnsService } from '../services/vat-returns.service';

describe('VatReturnDraftController', () => {
  const computeDraftFromLedger = jest.fn();
  const controller = new VatReturnDraftController({
    computeDraftFromLedger,
  } as unknown as VatReturnsService);

  beforeEach(() => {
    computeDraftFromLedger.mockReset();
  });

  it('delegates draft computation to VatReturnsService with query parameters', async () => {
    const mockDraft = {
      label: 'DRAFT, not for filing' as const,
      currency: 'SAR',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      status: 'complete' as const,
      outputVat: '140.0000',
      inputVat: '70.0000',
      netVat: '70.0000',
      totalSales: '1000.0000',
      totalPurchases: '500.0000',
      mismatches: [],
      exceptions: [],
      etaMismatches: [],
    };
    computeDraftFromLedger.mockResolvedValue(mockDraft);

    const result = await controller.draft('org-1', {
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });

    expect(computeDraftFromLedger).toHaveBeenCalledWith('org-1', '2026-01-01', '2026-01-31');
    expect(result).toEqual(mockDraft);
  });

  it('passes same-day timestamp through to service', async () => {
    computeDraftFromLedger.mockResolvedValue({ status: 'complete' });

    await controller.draft('org-1', {
      periodStart: '2026-01-31T12:00:00.000Z',
      periodEnd: '2026-01-31',
    });

    expect(computeDraftFromLedger).toHaveBeenCalledWith(
      'org-1',
      '2026-01-31T12:00:00.000Z',
      '2026-01-31',
    );
  });

  it('propagates service validation exceptions', async () => {
    computeDraftFromLedger.mockRejectedValue(
      new BadRequestException('periodStart must be before or equal to periodEnd'),
    );

    await expect(
      controller.draft('org-1', {
        periodStart: '2026-02-01',
        periodEnd: '2026-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
