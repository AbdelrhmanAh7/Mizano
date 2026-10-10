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
    await controller.getVatReturnDraft('org_1', { from: '2023-01-15', to: '2023-01-15' });
    expect(getDraft).toHaveBeenCalledWith('org_1', '2023-01-15', '2023-01-15');
  });

  it('@issue-114 AC5: rejects from > to with 400 and never queries the ledger', () => {
    const call = (): unknown =>
      controller.getVatReturnDraft('org_1', { from: '2023-02-01', to: '2023-01-31' });
    expect(call).toThrow(BadRequestException);
    expect(call).toThrow('from date must be before or equal to to date');
    expect(getDraft).not.toHaveBeenCalled();
  });
});
