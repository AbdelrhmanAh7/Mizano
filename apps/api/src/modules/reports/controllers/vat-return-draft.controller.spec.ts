import { BadRequestException } from '@nestjs/common';
import { VatReturnDraftController } from './vat-return-draft.controller';
import { VatReturnDraftService } from '../services/vat-return-draft.service';

describe('VatReturnDraftController', () => {
  const getDraft = jest.fn();
  const controller = new VatReturnDraftController({ getDraft } as unknown as VatReturnDraftService);

  beforeEach(() => getDraft.mockReset());

  it('@issue-114 AC1: passes the session organization and the raw dates to the service', async () => {
    getDraft.mockResolvedValue({ outputTax: '0.0000' });
    const result = await controller.getVatReturnDraft('org_1', {
      from: '2023-01-01',
      to: '2023-01-31',
    });
    expect(getDraft).toHaveBeenCalledWith('org_1', '2023-01-01', '2023-01-31');
    expect(result.outputTax).toBe('0.0000');
  });

  it('@issue-114 AC5: accepts a single-day range where from equals to', async () => {
    getDraft.mockResolvedValue({ outputTax: '0.0000' });
    await controller.getVatReturnDraft('org_1', { from: '2023-01-15', to: '2023-01-15' });
    expect(getDraft).toHaveBeenCalledWith('org_1', '2023-01-15', '2023-01-15');
  });

  it('@issue-114 AC3: passes a same-day timestamp through to the service unchanged (service resolveRange validates using UTC calendar days)', async () => {
    getDraft.mockResolvedValue({ outputTax: '0.0000' });
    await controller.getVatReturnDraft('org_1', {
      from: '2026-01-31T12:00:00Z',
      to: '2026-01-31',
    });
    // Controller delegates range validation to the service; both args are forwarded as-is.
    expect(getDraft).toHaveBeenCalledWith('org_1', '2026-01-31T12:00:00Z', '2026-01-31');
  });

  it('@issue-114 AC5: from > to is forwarded to the service (service rejects it with 400)', async () => {
    getDraft.mockRejectedValue(
      new BadRequestException('from date must be before or equal to to date'),
    );
    const call = controller.getVatReturnDraft('org_1', { from: '2023-02-01', to: '2023-01-31' });
    await expect(call).rejects.toThrow(BadRequestException);
    expect(getDraft).toHaveBeenCalledWith('org_1', '2023-02-01', '2023-01-31');
  });
});
