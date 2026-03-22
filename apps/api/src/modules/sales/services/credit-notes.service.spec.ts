import { Test, TestingModule } from '@nestjs/testing';
import { CreditNotesService } from './credit-notes.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { InvoicesService } from './invoices.service';

const mockFindMany = jest.fn();
const mockCount = jest.fn();

const prismaServiceMock = {
  creditNote: { findMany: mockFindMany, count: mockCount },
};

describe('CreditNotesService.findAll', () => {
  let service: CreditNotesService;

  beforeEach(async () => {
    mockFindMany.mockReset();
    mockCount.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNotesService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: JournalsService, useValue: {} },
        { provide: InvoicesService, useValue: {} },
      ],
    }).compile();

    service = module.get<CreditNotesService>(CreditNotesService);
  });

  it('filters by customerId when provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { customerId: 'cust-abc', limit: 10 });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.customerId).toBe('cust-abc');
    expect(whereArg.organizationId).toBe('org-1');
    expect(whereArg.deletedAt).toBeNull();
  });

  it('does not add customerId to where when not provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', {});

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.customerId).toBeUndefined();
  });

  it('respects limit parameter', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { limit: 10 });

    expect(mockFindMany.mock.calls[0][0].take).toBe(10);
  });

  it('returns paginated response shape', async () => {
    mockFindMany.mockResolvedValue([{ id: 'cn-1' }]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});

    expect(result).toEqual({
      data: [{ id: 'cn-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});
