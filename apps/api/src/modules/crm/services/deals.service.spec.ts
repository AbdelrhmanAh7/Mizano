/**
 * Regression tests for DealsService.getPipelineMetrics.
 *
 * Error: GET /api/crm/deals/pipeline-metrics → 404 "Deal not found"
 *   Root cause: route did not exist — NestJS matched "pipeline-metrics" to
 *   GET /deals/:id, which called findOne() and threw NotFoundException.
 *   Fix: added getPipelineMetrics() to DealsService and added
 *   GET deals/pipeline-metrics route BEFORE GET deals/:id in the controller.
 */

import { DealsService } from './deals.service';
import { DealStage } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── Prisma mock helpers ───────────────────────────────────────────────────────

const mockGroupBy = jest.fn();
const mockAggregate = jest.fn();
const mockFindMany = jest.fn();

const mockPrisma = {
  deal: {
    groupBy: mockGroupBy,
    aggregate: mockAggregate,
    findMany: mockFindMany,
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ── Service under test ────────────────────────────────────────────────────────

describe('DealsService.getPipelineMetrics', () => {
  let service: DealsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DealsService(mockPrisma as never);
  });

  it('returns zero metrics when there are no deals', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockAggregate.mockResolvedValue({ _count: { id: 0 } });
    mockFindMany.mockResolvedValue([]);

    const result = await service.getPipelineMetrics('org-001');

    expect(result.totalDeals).toBe(0);
    expect(result.totalValue).toBe(0);
    expect(result.weightedValue).toBe(0);
    expect(result.conversionRate).toBe(0);
    expect(result.byStage).toBeDefined();
    // All stages should be initialised to 0
    expect(result.byStage[DealStage.NEW]).toEqual({ count: 0, value: 0 });
    expect(result.byStage[DealStage.WON]).toEqual({ count: 0, value: 0 });
  });

  it('aggregates total deals and total value correctly', async () => {
    mockGroupBy.mockResolvedValue([
      { stage: DealStage.NEW, _count: { id: 3 }, _sum: { expectedAmount: new Decimal('9000') } },
      { stage: DealStage.WON, _count: { id: 2 }, _sum: { expectedAmount: new Decimal('4000') } },
    ]);
    mockAggregate.mockResolvedValue({ _count: { id: 2 } }); // 2 closed (2 won, 0 lost)
    mockFindMany.mockResolvedValue([]); // no open deals for weighted

    const result = await service.getPipelineMetrics('org-001');

    expect(result.totalDeals).toBe(5);
    expect(result.totalValue).toBe(13000);
    expect(result.byStage[DealStage.NEW]).toEqual({ count: 3, value: 9000 });
    expect(result.byStage[DealStage.WON]).toEqual({ count: 2, value: 4000 });
  });

  it('calculates weighted value from open deals and their probabilities', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockAggregate.mockResolvedValue({ _count: { id: 0 } });
    mockFindMany.mockResolvedValue([
      { expectedAmount: new Decimal('10000'), probability: 50 }, // weighted = 5000
      { expectedAmount: new Decimal('20000'), probability: 75 }, // weighted = 15000
    ]);

    const result = await service.getPipelineMetrics('org-001');

    expect(result.weightedValue).toBeCloseTo(20000, 2);
  });

  it('calculates conversionRate as won/(won+lost)*100', async () => {
    mockGroupBy.mockResolvedValue([
      { stage: DealStage.WON, _count: { id: 3 }, _sum: { expectedAmount: new Decimal('6000') } },
      { stage: DealStage.LOST, _count: { id: 1 }, _sum: { expectedAmount: new Decimal('2000') } },
    ]);
    mockAggregate.mockResolvedValue({ _count: { id: 4 } }); // 4 total closed
    mockFindMany.mockResolvedValue([]);

    const result = await service.getPipelineMetrics('org-001');

    expect(result.conversionRate).toBeCloseTo(75, 5); // 3/4 = 75%
  });

  it('returns 0% conversion rate when no deals are closed', async () => {
    mockGroupBy.mockResolvedValue([
      { stage: DealStage.NEW, _count: { id: 5 }, _sum: { expectedAmount: new Decimal('5000') } },
    ]);
    mockAggregate.mockResolvedValue({ _count: { id: 0 } });
    mockFindMany.mockResolvedValue([]);

    const result = await service.getPipelineMetrics('org-001');

    expect(result.conversionRate).toBe(0);
  });

  it('always uses organizationId in all queries (multi-tenancy)', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockAggregate.mockResolvedValue({ _count: { id: 0 } });
    mockFindMany.mockResolvedValue([]);

    await service.getPipelineMetrics('org-tenant-xyz');

    // groupBy — first call
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-xyz' }),
      }),
    );
    // aggregate — closed deals
    expect(mockAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-xyz' }),
      }),
    );
    // findMany — open deals
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-xyz' }),
      }),
    );
  });

  it('includes deletedAt: null in all queries (soft-delete filter)', async () => {
    mockGroupBy.mockResolvedValue([]);
    mockAggregate.mockResolvedValue({ _count: { id: 0 } });
    mockFindMany.mockResolvedValue([]);

    await service.getPipelineMetrics('org-001');

    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
    expect(mockAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });
});
