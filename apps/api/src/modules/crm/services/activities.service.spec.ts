/**
 * Regression tests for ActivitiesService.findAll with dealId filter.
 *
 * Error: GET /api/crm/deals/deal-002/activities → 404
 *   Root cause: no route existed — NestJS had no handler for
 *   GET /crm/deals/:id/activities, returning a 404 from the global filter.
 *   Fix: added GET deals/:id/activities to CrmController, which delegates
 *   to activitiesService.findAll(orgId, { dealId: id, limit }).
 */

import { ActivitiesService } from './activities.service';
import { NotFoundException } from '@nestjs/common';

// ── Prisma mock helpers ───────────────────────────────────────────────────────

const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockFindFirst = jest.fn();

const mockPrisma = {
  activityLog: {
    findMany: mockFindMany,
    count: mockCount,
    findFirst: mockFindFirst,
    create: jest.fn(),
    delete: jest.fn(),
    groupBy: jest.fn(),
  },
  lead: { findFirst: jest.fn() },
  deal: { findFirst: jest.fn() },
};

// ── Service under test ────────────────────────────────────────────────────────

describe('ActivitiesService.findAll', () => {
  let service: ActivitiesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActivitiesService(mockPrisma as never);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('returns activities filtered by dealId', async () => {
    const activity = { id: 'act-001', dealId: 'deal-002', type: 'CALL', description: 'Follow up' };
    mockFindMany.mockResolvedValue([activity]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll('org-001', { dealId: 'deal-002' });

    expect(result.data).toEqual([activity]);
    expect(result.total).toBe(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-001', dealId: 'deal-002' }),
      }),
    );
  });

  it('returns empty data array when no activities exist for deal', async () => {
    const result = await service.findAll('org-001', { dealId: 'deal-empty' });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('always includes organizationId in query (multi-tenancy)', async () => {
    await service.findAll('org-tenant-xyz', { dealId: 'deal-002' });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-xyz' }),
      }),
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-xyz' }),
      }),
    );
  });

  it('respects the limit query param', async () => {
    await service.findAll('org-001', { dealId: 'deal-002', limit: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it('defaults limit to 50 when not provided', async () => {
    await service.findAll('org-001', { dealId: 'deal-002' });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('returns activities ordered by date descending', async () => {
    await service.findAll('org-001', { dealId: 'deal-002' });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { date: 'desc' } }),
    );
  });
});

describe('ActivitiesService.findOne', () => {
  let service: ActivitiesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActivitiesService(mockPrisma as never);
  });

  it('throws NotFoundException when activity does not exist', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(service.findOne('org-001', 'missing-act')).rejects.toThrow(NotFoundException);
  });

  it('returns activity when found', async () => {
    const activity = { id: 'act-001', organizationId: 'org-001', type: 'NOTE' };
    mockFindFirst.mockResolvedValue(activity);

    const result = await service.findOne('org-001', 'act-001');
    expect(result).toEqual(activity);
  });
});
