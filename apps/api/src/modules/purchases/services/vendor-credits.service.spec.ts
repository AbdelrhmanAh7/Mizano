import { Test, TestingModule } from '@nestjs/testing';
import { VendorCreditsService } from './vendor-credits.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';

const mockFindMany = jest.fn();
const mockCount = jest.fn();

const prismaServiceMock = {
  vendorCredit: { findMany: mockFindMany, count: mockCount },
};

describe('VendorCreditsService.findAll', () => {
  let service: VendorCreditsService;

  beforeEach(async () => {
    mockFindMany.mockReset();
    mockCount.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorCreditsService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: JournalsService, useValue: {} },
      ],
    }).compile();

    service = module.get<VendorCreditsService>(VendorCreditsService);
  });

  it('filters by vendorId when provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { vendorId: 'vendor-xyz', limit: 100 });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.vendorId).toBe('vendor-xyz');
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
    mockFindMany.mockResolvedValue([{ id: 'vc-1' }]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});

    expect(result).toEqual({
      data: [{ id: 'vc-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});
