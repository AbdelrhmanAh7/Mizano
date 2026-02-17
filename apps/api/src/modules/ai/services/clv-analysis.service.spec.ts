import { Test, TestingModule } from '@nestjs/testing';
import { ClvAnalysisService, CLVResult } from './clv-analysis.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ClvAnalysisService', () => {
  let service: ClvAnalysisService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  function createMockCustomer(overrides: Record<string, any> = {}) {
    return {
      id: 'cust-001',
      organizationId: orgId,
      name: 'Acme Corp',
      createdAt: new Date('2024-01-01'),
      deletedAt: null,
      ...overrides,
    };
  }

  function createMockInvoice(overrides: Record<string, any> = {}) {
    return {
      date: new Date('2024-06-01'),
      grandTotal: mockDecimal(5000),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClvAnalysisService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ClvAnalysisService>(ClvAnalysisService);
  });

  // ---------------------------------------------------------------------------
  // calculateCLV
  // ---------------------------------------------------------------------------
  describe('calculateCLV', () => {
    it('should throw when customer is not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null as any);

      await expect(service.calculateCLV(orgId, 'non-existent')).rejects.toThrow(
        'Customer non-existent not found',
      );
    });

    it('should return zero CLV for customer with no paid invoices', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);
      prisma.customerAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.calculateCLV(orgId, 'cust-001');

      expect(result.lifetimeValue).toBe(0);
      expect(result.segment).toBe('LOW');
      expect(result.avgOrderValue).toBe(0);
      expect(result.purchaseFrequency).toBe(0);
      expect(result.retentionProbability).toBe(0.1);
      expect(result.confidence).toBe(0.3);
    });

    it('should calculate CLV for a high-value customer', async () => {
      const customer = createMockCustomer({
        createdAt: new Date('2023-01-01'),
      });
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      prisma.invoice.findMany.mockResolvedValue([
        createMockInvoice({ date: new Date('2023-03-01'), grandTotal: mockDecimal(10000) }),
        createMockInvoice({ date: new Date('2023-06-01'), grandTotal: mockDecimal(15000) }),
        createMockInvoice({ date: new Date('2023-09-01'), grandTotal: mockDecimal(12000) }),
        createMockInvoice({ date: new Date('2024-01-01'), grandTotal: mockDecimal(20000) }),
        createMockInvoice({ date: new Date('2024-06-01'), grandTotal: mockDecimal(18000) }),
      ] as any);
      prisma.customerAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.calculateCLV(orgId, 'cust-001');

      expect(result.lifetimeValue).toBeGreaterThan(0);
      expect(result.avgOrderValue).toBeGreaterThan(0);
      expect(result.purchaseFrequency).toBeGreaterThan(0);
      expect(result.customerName).toBe('Acme Corp');
      expect(result.customerId).toBe('cust-001');
    });

    it('should return higher confidence with more data points', async () => {
      const customer = createMockCustomer({
        createdAt: new Date('2023-01-01'),
      });
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      const manyInvoices = Array.from({ length: 10 }, (_, i) =>
        createMockInvoice({
          date: new Date(`2023-${String(i + 1).padStart(2, '0')}-01`),
          grandTotal: mockDecimal(5000 + i * 100),
        }),
      );
      prisma.invoice.findMany.mockResolvedValue(manyInvoices as any);
      prisma.customerAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.calculateCLV(orgId, 'cust-001');

      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should persist CLV to customerAiProfile', async () => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findMany.mockResolvedValue([createMockInvoice()] as any);
      prisma.customerAiProfile.upsert.mockResolvedValue({} as any);

      await service.calculateCLV(orgId, 'cust-001');

      expect(prisma.customerAiProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'cust-001' },
        }),
      );
    });

    it('should compute retention probability based on recency', async () => {
      const customer = createMockCustomer({
        createdAt: new Date('2024-01-01'),
      });
      prisma.customer.findFirst.mockResolvedValue(customer as any);
      // Very recent purchase -> high retention
      prisma.invoice.findMany.mockResolvedValue([
        createMockInvoice({
          date: new Date(Date.now() - 5 * 86400000),
          grandTotal: mockDecimal(1000),
        }),
      ] as any);
      prisma.customerAiProfile.upsert.mockResolvedValue({} as any);

      const result = await service.calculateCLV(orgId, 'cust-001');

      expect(result.retentionProbability).toBeGreaterThan(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // calculateAllCLV
  // ---------------------------------------------------------------------------
  describe('calculateAllCLV', () => {
    it('should return zero segments for org with no customers', async () => {
      prisma.customer.findMany.mockResolvedValue([] as any);

      const result = await service.calculateAllCLV(orgId);

      expect(result.processed).toBe(0);
      expect(result.bySegment).toEqual({ HIGH: 0, MEDIUM: 0, LOW: 0 });
    });

    it('should process all customers and segment them', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'cust-1' },
        { id: 'cust-2' },
        { id: 'cust-3' },
      ] as any);

      // Each calculateCLV call needs customer + invoices
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.invoice.findMany.mockResolvedValue([createMockInvoice()] as any);
      prisma.customerAiProfile.upsert.mockResolvedValue({} as any);
      prisma.customerAiProfile.updateMany.mockResolvedValue({} as any);

      const result = await service.calculateAllCLV(orgId);

      expect(result.processed).toBe(3);
      expect(result.bySegment.HIGH + result.bySegment.MEDIUM + result.bySegment.LOW).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // getSegments
  // ---------------------------------------------------------------------------
  describe('getSegments', () => {
    it('should return all three segments even when empty', async () => {
      prisma.customerAiProfile.findMany.mockResolvedValue([] as any);

      const segments = await service.getSegments(orgId);

      expect(segments).toHaveLength(3);
      const segmentNames = segments.map((s) => s.segment);
      expect(segmentNames).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    });

    it('should correctly calculate segment statistics', async () => {
      prisma.customerAiProfile.findMany.mockResolvedValue([
        { lifetimeValue: mockDecimal(10000), clvSegment: 'HIGH' },
        { lifetimeValue: mockDecimal(8000), clvSegment: 'HIGH' },
        { lifetimeValue: mockDecimal(3000), clvSegment: 'MEDIUM' },
        { lifetimeValue: mockDecimal(500), clvSegment: 'LOW' },
      ] as any);

      const segments = await service.getSegments(orgId);

      const high = segments.find((s) => s.segment === 'HIGH')!;
      expect(high.count).toBe(2);
      expect(high.totalCLV).toBe(18000);
      expect(high.avgCLV).toBe(9000);
      expect(high.percentOfCustomers).toBe(50);
    });

    it('should return zero averages for segments with no customers', async () => {
      prisma.customerAiProfile.findMany.mockResolvedValue([
        { lifetimeValue: mockDecimal(1000), clvSegment: 'MEDIUM' },
      ] as any);

      const segments = await service.getSegments(orgId);

      const high = segments.find((s) => s.segment === 'HIGH')!;
      expect(high.count).toBe(0);
      expect(high.avgCLV).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getDistribution
  // ---------------------------------------------------------------------------
  describe('getDistribution', () => {
    it('should return zeros for empty organization', async () => {
      prisma.customerAiProfile.findMany.mockResolvedValue([] as any);

      const dist = await service.getDistribution(orgId);

      expect(dist.mean).toBe(0);
      expect(dist.median).toBe(0);
      expect(dist.stdDev).toBe(0);
      expect(dist.min).toBe(0);
      expect(dist.max).toBe(0);
      expect(dist.totalCustomers).toBe(0);
      expect(dist.totalCLV).toBe(0);
    });

    it('should compute correct statistics', async () => {
      prisma.customerAiProfile.findMany.mockResolvedValue([
        { lifetimeValue: mockDecimal(1000) },
        { lifetimeValue: mockDecimal(2000) },
        { lifetimeValue: mockDecimal(3000) },
        { lifetimeValue: mockDecimal(4000) },
        { lifetimeValue: mockDecimal(5000) },
      ] as any);

      const dist = await service.getDistribution(orgId);

      expect(dist.mean).toBe(3000);
      expect(dist.median).toBe(3000);
      expect(dist.min).toBe(1000);
      expect(dist.max).toBe(5000);
      expect(dist.totalCustomers).toBe(5);
      expect(dist.totalCLV).toBe(15000);
      expect(dist.percentile25).toBeDefined();
      expect(dist.percentile75).toBeDefined();
    });
  });
});
