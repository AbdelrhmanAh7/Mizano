import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsMadeService } from './payments-made.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { BillsService } from './bills.service';

const mockFindMany = jest.fn();
const mockCount = jest.fn();

const prismaServiceMock = {
  paymentMade: { findMany: mockFindMany, count: mockCount },
};

describe('PaymentsMadeService.findAll', () => {
  let service: PaymentsMadeService;

  beforeEach(async () => {
    mockFindMany.mockReset();
    mockCount.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsMadeService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: JournalsService, useValue: {} },
        { provide: BillsService, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentsMadeService>(PaymentsMadeService);
  });

  it('filters by vendorId when provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { vendorId: 'vend-xyz', limit: 100 });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.vendorId).toBe('vend-xyz');
    expect(whereArg.organizationId).toBe('org-1');
    expect(whereArg.deletedAt).toBeNull();
  });

  it('does not add vendorId to where when not provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', {});

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.vendorId).toBeUndefined();
  });

  it('respects limit parameter', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { limit: 100 });

    expect(mockFindMany.mock.calls[0][0].take).toBe(100);
  });

  it('returns paginated response shape', async () => {
    mockFindMany.mockResolvedValue([{ id: 'pm-1' }]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});

    expect(result).toEqual({
      data: [{ id: 'pm-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});
