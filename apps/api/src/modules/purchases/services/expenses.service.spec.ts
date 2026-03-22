import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';

const mockFindMany = jest.fn();
const mockCount = jest.fn();

const prismaServiceMock = {
  expense: { findMany: mockFindMany, count: mockCount },
};

describe('ExpensesService.findAll', () => {
  let service: ExpensesService;

  beforeEach(async () => {
    mockFindMany.mockReset();
    mockCount.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: JournalsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  it('filters by vendorId when provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { vendorId: 'vendor-abc', page: 1, limit: 100 });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.vendorId).toBe('vendor-abc');
    expect(whereArg.organizationId).toBe('org-1');
    expect(whereArg.deletedAt).toBeNull();
  });

  it('does not add vendorId to where when not provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { page: 1, limit: 20 });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.vendorId).toBeUndefined();
  });

  it('filters by date range when dateFrom/dateTo provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', {
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.date.gte).toEqual(new Date('2025-01-01'));
    expect(whereArg.date.lte).toEqual(new Date('2025-12-31'));
  });

  it('respects limit parameter', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { limit: 100 });

    expect(mockFindMany.mock.calls[0][0].take).toBe(100);
  });

  it('returns paginated response shape', async () => {
    mockFindMany.mockResolvedValue([{ id: 'exp-1' }]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});

    expect(result).toEqual({
      data: [{ id: 'exp-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});
