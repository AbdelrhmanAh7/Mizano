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
});
