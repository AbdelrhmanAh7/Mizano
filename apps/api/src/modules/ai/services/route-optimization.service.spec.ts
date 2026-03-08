import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RouteOptimizationService } from './route-optimization.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('RouteOptimizationService', () => {
  let service: RouteOptimizationService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RouteOptimizationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<RouteOptimizationService>(RouteOptimizationService);
  });

  describe('optimizeRoute', () => {
    it('should return both stops in optimized order for 2 stops', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-1',
          challanNumber: 'DC-001',
          customer: {
            name: 'Client A',
            city: null,
            billingCity: 'Cairo',
            shippingCity: 'Cairo',
            billingState: 'Cairo Gov',
            shippingState: 'Cairo Gov',
            billingCountry: 'Egypt',
            shippingCountry: 'Egypt',
            country: 'Egypt',
          },
        },
        {
          id: 'dc-2',
          challanNumber: 'DC-002',
          customer: {
            name: 'Client B',
            city: null,
            billingCity: 'Cairo',
            shippingCity: 'Cairo',
            billingState: 'Cairo Gov',
            shippingState: 'Cairo Gov',
            billingCountry: 'Egypt',
            shippingCountry: 'Egypt',
            country: 'Egypt',
          },
        },
      ] as any);

      const result = await service.optimizeRoute(TEST_ORG_ID, ['dc-1', 'dc-2']);

      expect(result.totalStops).toBe(2);
      expect(result.optimizedOrder).toHaveLength(2);
      expect(result.optimizedOrder[0].sequence).toBe(1);
      expect(result.optimizedOrder[1].sequence).toBe(2);
      expect(result.regionCount).toBeGreaterThan(0);
    });

    it('should return single stop for a single delivery', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-single',
          challanNumber: 'DC-ONLY',
          customer: {
            name: 'Solo Client',
            city: 'Alex',
            billingCity: 'Alex',
            shippingCity: 'Alex',
            billingState: 'Alex Gov',
            shippingState: 'Alex Gov',
            billingCountry: 'Egypt',
            shippingCountry: 'Egypt',
            country: 'Egypt',
          },
        },
      ] as any);

      const result = await service.optimizeRoute(TEST_ORG_ID, ['dc-single']);

      expect(result.totalStops).toBe(1);
      expect(result.optimizedOrder).toHaveLength(1);
      expect(result.optimizedOrder[0].customerName).toBe('Solo Client');
      expect(result.optimizedOrder[0].sequence).toBe(1);
    });

    it('should return empty route for empty deliveries', async () => {
      const result = await service.optimizeRoute(TEST_ORG_ID, []);

      expect(result.totalStops).toBe(0);
      expect(result.optimizedOrder).toEqual([]);
      expect(result.estimatedSavings).toBe('0%');
      expect(result.regionCount).toBe(0);
    });

    it('should return empty route when no deliveries found in DB', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([] as any);

      const result = await service.optimizeRoute(TEST_ORG_ID, ['dc-nonexistent']);

      expect(result.totalStops).toBe(0);
      expect(result.optimizedOrder).toEqual([]);
    });

    it('should group nearby stops together', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-cairo1',
          challanNumber: 'DC-C1',
          customer: {
            name: 'Cairo Client 1',
            city: 'Cairo',
            billingCity: 'Cairo',
            shippingCity: 'Cairo',
            billingState: null,
            shippingState: null,
            billingCountry: 'Egypt',
            shippingCountry: 'Egypt',
            country: 'Egypt',
          },
        },
        {
          id: 'dc-alex',
          challanNumber: 'DC-A1',
          customer: {
            name: 'Alex Client',
            city: 'Alexandria',
            billingCity: 'Alexandria',
            shippingCity: 'Alexandria',
            billingState: null,
            shippingState: null,
            billingCountry: 'Egypt',
            shippingCountry: 'Egypt',
            country: 'Egypt',
          },
        },
        {
          id: 'dc-cairo2',
          challanNumber: 'DC-C2',
          customer: {
            name: 'Cairo Client 2',
            city: 'Cairo',
            billingCity: 'Cairo',
            shippingCity: 'Cairo',
            billingState: null,
            shippingState: null,
            billingCountry: 'Egypt',
            shippingCountry: 'Egypt',
            country: 'Egypt',
          },
        },
        {
          id: 'dc-cairo3',
          challanNumber: 'DC-C3',
          customer: {
            name: 'Cairo Client 3',
            city: 'Cairo',
            billingCity: 'Cairo',
            shippingCity: 'Cairo',
            billingState: null,
            shippingState: null,
            billingCountry: 'Egypt',
            shippingCountry: 'Egypt',
            country: 'Egypt',
          },
        },
      ] as any);

      const result = await service.optimizeRoute(TEST_ORG_ID, [
        'dc-cairo1',
        'dc-alex',
        'dc-cairo2',
        'dc-cairo3',
      ]);

      expect(result.totalStops).toBe(4);
      expect(result.regionCount).toBe(2); // Cairo and Alexandria

      // Cairo clients should be grouped together in the optimized route
      const cairoPositions = result.optimizedOrder
        .filter((s) => s.city === 'Cairo')
        .map((s) => s.sequence);

      // Check that Cairo stops are consecutive
      const sorted = [...cairoPositions].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i + 1] - sorted[i]).toBe(1);
      }
    });

    it('should include delivery IDs and challan numbers in optimized order', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-001',
          challanNumber: 'DC-001',
          customer: {
            name: 'Test',
            city: 'TestCity',
            billingCity: 'TestCity',
            shippingCity: 'TestCity',
            billingState: 'TestState',
            shippingState: 'TestState',
            billingCountry: 'TestCountry',
            shippingCountry: 'TestCountry',
            country: 'TestCountry',
          },
        },
      ] as any);

      const result = await service.optimizeRoute(TEST_ORG_ID, ['dc-001']);

      expect(result.optimizedOrder[0].deliveryId).toBe('dc-001');
      expect(result.optimizedOrder[0].challanNumber).toBe('DC-001');
      expect(result.optimizedOrder[0].customerName).toBe('Test');
      expect(result.optimizedOrder[0].city).toBe('TestCity');
      expect(result.optimizedOrder[0].state).toBe('TestState');
      expect(result.optimizedOrder[0].country).toBe('TestCountry');
    });

    it('should calculate estimated savings percentage', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-1',
          challanNumber: 'DC-1',
          customer: {
            name: 'A',
            city: null,
            billingCity: 'CityA',
            shippingCity: 'CityA',
            billingState: 'StateA',
            shippingState: 'StateA',
            billingCountry: 'CountryA',
            shippingCountry: 'CountryA',
            country: 'CountryA',
          },
        },
        {
          id: 'dc-2',
          challanNumber: 'DC-2',
          customer: {
            name: 'B',
            city: null,
            billingCity: 'CityB',
            shippingCity: 'CityB',
            billingState: 'StateA',
            shippingState: 'StateA',
            billingCountry: 'CountryA',
            shippingCountry: 'CountryA',
            country: 'CountryA',
          },
        },
        {
          id: 'dc-3',
          challanNumber: 'DC-3',
          customer: {
            name: 'C',
            city: null,
            billingCity: 'CityA',
            shippingCity: 'CityA',
            billingState: 'StateA',
            shippingState: 'StateA',
            billingCountry: 'CountryA',
            shippingCountry: 'CountryA',
            country: 'CountryA',
          },
        },
        {
          id: 'dc-4',
          challanNumber: 'DC-4',
          customer: {
            name: 'D',
            city: null,
            billingCity: 'CityC',
            shippingCity: 'CityC',
            billingState: 'StateB',
            shippingState: 'StateB',
            billingCountry: 'CountryA',
            shippingCountry: 'CountryA',
            country: 'CountryA',
          },
        },
      ] as any);

      const result = await service.optimizeRoute(TEST_ORG_ID, ['dc-1', 'dc-2', 'dc-3', 'dc-4']);

      expect(result.estimatedSavings).toMatch(/\d+%/);
    });
  });

  describe('estimateDelivery', () => {
    it('should return default estimate when no historical data', async () => {
      prisma.deliveryChallan.findFirst.mockResolvedValue({
        id: 'dc-new',
        challanNumber: 'DC-NEW',
        customer: {
          shippingCity: 'New City',
          billingCity: null,
          city: null,
          shippingState: 'New State',
          billingState: null,
          shippingCountry: 'New Country',
          billingCountry: null,
          country: null,
        },
      } as any);

      prisma.deliveryChallan.findMany.mockResolvedValue([] as any);

      const result = await service.estimateDelivery(TEST_ORG_ID, 'dc-new');

      expect(result.deliveryId).toBe('dc-new');
      expect(result.estimatedDays).toBe(5); // default
      expect(result.confidence).toBe(0.2); // lowest confidence
      expect(result.basedOnHistory).toBe(0);
    });

    it('should throw NotFoundException when delivery not found', async () => {
      prisma.deliveryChallan.findFirst.mockResolvedValue(null as any);

      await expect(service.estimateDelivery(TEST_ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use city-level matching for highest confidence', async () => {
      prisma.deliveryChallan.findFirst.mockResolvedValue({
        id: 'dc-est',
        challanNumber: 'DC-EST',
        customer: {
          shippingCity: 'Cairo',
          billingCity: 'Cairo',
          city: 'Cairo',
          shippingState: 'Cairo Gov',
          billingState: 'Cairo Gov',
          shippingCountry: 'Egypt',
          billingCountry: 'Egypt',
          country: 'Egypt',
        },
      } as any);

      // Historical deliveries to same city
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-hist-1',
          status: 'RETURNED',
          date: threeDaysAgo,
          createdAt: threeDaysAgo,
          updatedAt: new Date(),
          customer: {
            shippingCity: 'Cairo',
            billingCity: null,
            city: null,
            shippingState: null,
            billingState: null,
            shippingCountry: null,
            billingCountry: null,
            country: null,
          },
        },
      ] as any);

      const result = await service.estimateDelivery(TEST_ORG_ID, 'dc-est');

      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.basedOnHistory).toBeGreaterThan(0);
      expect(result.estimatedDays).toBeGreaterThan(0);
    });

    it('should return challan number in the estimate', async () => {
      prisma.deliveryChallan.findFirst.mockResolvedValue({
        id: 'dc-x',
        challanNumber: 'DC-12345',
        customer: {
          shippingCity: null,
          billingCity: null,
          city: null,
          shippingState: null,
          billingState: null,
          shippingCountry: null,
          billingCountry: null,
          country: null,
        },
      } as any);

      prisma.deliveryChallan.findMany.mockResolvedValue([] as any);

      const result = await service.estimateDelivery(TEST_ORG_ID, 'dc-x');

      expect(result.challanNumber).toBe('DC-12345');
    });
  });

  describe('getRouteAnalytics', () => {
    it('should return analytics with regional breakdown', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-1',
          status: 'RETURNED',
          createdAt: new Date(Date.now() - 5 * 86400000),
          updatedAt: new Date(),
          customer: {
            shippingCity: 'Cairo',
            billingCity: null,
            city: null,
          },
        },
        {
          id: 'dc-2',
          status: 'RETURNED',
          createdAt: new Date(Date.now() - 3 * 86400000),
          updatedAt: new Date(),
          customer: {
            shippingCity: 'Cairo',
            billingCity: null,
            city: null,
          },
        },
        {
          id: 'dc-3',
          status: 'ISSUED',
          createdAt: new Date(Date.now() - 2 * 86400000),
          updatedAt: new Date(),
          customer: {
            shippingCity: 'Alexandria',
            billingCity: null,
            city: null,
          },
        },
      ] as any);

      const result = await service.getRouteAnalytics(TEST_ORG_ID);

      expect(result.totalDeliveries).toBe(3);
      expect(result.byRegion.length).toBe(2);
      expect(result.byRegion[0].region).toBe('Cairo'); // More deliveries → first
      expect(result.byRegion[0].count).toBe(2);
      expect(result.onTimeRate).toBeGreaterThan(0);
      expect(result.avgDeliveryDays).toBeGreaterThan(0);
    });

    it('should return empty analytics when no deliveries exist', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([] as any);

      const result = await service.getRouteAnalytics(TEST_ORG_ID);

      expect(result.totalDeliveries).toBe(0);
      expect(result.byRegion).toEqual([]);
      expect(result.onTimeRate).toBe(0);
      expect(result.avgDeliveryDays).toBe(0);
    });

    it('should calculate on-time rate from non-draft deliveries', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'dc-done',
          status: 'RETURNED',
          createdAt: new Date(Date.now() - 86400000),
          updatedAt: new Date(),
          customer: { shippingCity: 'City', billingCity: null, city: null },
        },
        {
          id: 'dc-pending',
          status: 'ISSUED',
          createdAt: new Date(Date.now() - 86400000),
          updatedAt: new Date(),
          customer: { shippingCity: 'City', billingCity: null, city: null },
        },
        {
          id: 'dc-draft',
          status: 'DRAFT',
          createdAt: new Date(),
          updatedAt: new Date(),
          customer: { shippingCity: 'City', billingCity: null, city: null },
        },
      ] as any);

      const result = await service.getRouteAnalytics(TEST_ORG_ID);

      // 2 completed out of 2 non-draft = 100% on-time rate
      expect(result.onTimeRate).toBe(1);
    });

    it('should sort regions by delivery count descending', async () => {
      prisma.deliveryChallan.findMany.mockResolvedValue([
        {
          id: 'd1',
          status: 'DRAFT',
          createdAt: new Date(),
          updatedAt: new Date(),
          customer: { shippingCity: 'Small', billingCity: null, city: null },
        },
        {
          id: 'd2',
          status: 'DRAFT',
          createdAt: new Date(),
          updatedAt: new Date(),
          customer: { shippingCity: 'Big', billingCity: null, city: null },
        },
        {
          id: 'd3',
          status: 'DRAFT',
          createdAt: new Date(),
          updatedAt: new Date(),
          customer: { shippingCity: 'Big', billingCity: null, city: null },
        },
        {
          id: 'd4',
          status: 'DRAFT',
          createdAt: new Date(),
          updatedAt: new Date(),
          customer: { shippingCity: 'Big', billingCity: null, city: null },
        },
      ] as any);

      const result = await service.getRouteAnalytics(TEST_ORG_ID);

      expect(result.byRegion[0].region).toBe('Big');
      expect(result.byRegion[0].count).toBe(3);
    });
  });
});
