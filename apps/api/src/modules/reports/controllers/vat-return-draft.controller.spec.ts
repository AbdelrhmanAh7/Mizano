import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VatReturnDraftController } from './vat-return-draft.controller';
import { VatReturnDraftService } from '../services/vat-return-draft.service';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

describe('VatReturnDraftController', () => {
  let controller: VatReturnDraftController;
  let service: VatReturnDraftService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VatReturnDraftController],
      providers: [
        {
          provide: VatReturnDraftService,
          useValue: {
            getDraft: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VatReturnDraftController>(VatReturnDraftController);
    service = module.get<VatReturnDraftService>(VatReturnDraftService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('calls getDraft with correctly parsed dates', async () => {
    jest.spyOn(service, 'getDraft').mockResolvedValue({
      label: 'DRAFT, not for filing',
      from: '2023-01-01T00:00:00.000Z',
      to: '2023-01-31T00:00:00.000Z',
      status: 'complete',
      outputTax: '0.0000',
      inputTax: '0.0000',
      netPayable: '0.0000',
      exceptions: [],
    });

    const result = await controller.getVatReturnDraft('org_1', {
      from: '2023-01-01',
      to: '2023-01-31',
    });
    expect(service.getDraft).toHaveBeenCalledWith('org_1', '2023-01-01', '2023-01-31');
    expect(result.outputTax).toBe('0.0000');
  });

  it('accepts a single-day range where from equals to', async () => {
    jest.spyOn(service, 'getDraft').mockResolvedValue({
      label: 'DRAFT, not for filing',
      from: '2023-01-15T00:00:00.000Z',
      to: '2023-01-15T00:00:00.000Z',
      status: 'complete',
      outputTax: '0.0000',
      inputTax: '0.0000',
      netPayable: '0.0000',
      exceptions: [],
    });

    await controller.getVatReturnDraft('org_1', { from: '2023-01-15', to: '2023-01-15' });
    expect(service.getDraft).toHaveBeenCalledWith('org_1', '2023-01-15', '2023-01-15');
  });

  it('rejects from > to with 400 and never queries the ledger', () => {
    const getDraft = jest.spyOn(service, 'getDraft');

    const call = (): unknown =>
      controller.getVatReturnDraft('org_1', { from: '2023-02-01', to: '2023-01-31' });

    expect(call).toThrow(BadRequestException);
    expect(call).toThrow('from date must be before or equal to to date');
    expect(getDraft).not.toHaveBeenCalled();
  });
});
