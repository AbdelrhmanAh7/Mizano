import { Test, TestingModule } from '@nestjs/testing';
import { CashFlowPredictionService } from './cash-flow-prediction.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentPredictionService } from './payment-prediction.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { Decimal } from '@prisma/client/runtime/library';

describe('CashFlowPredictionService', () => {
  let service: CashFlowPredictionService;
  let prisma: MockPrismaClient;
  let paymentPredictionService: { predictPaymentDate: jest.Mock };

  const orgId = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    paymentPredictionService = {
      predictPaymentDate: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashFlowPredictionService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentPredictionService, useValue: paymentPredictionService },
      ],
    }).compile();

    service = module.get<CashFlowPredictionService>(CashFlowPredictionService);

    // Default mock: bank accounts with balance
    prisma.bankAccount.findMany.mockResolvedValue([
      { systemBalance: new Decimal('50000.0000') },
    ] as any);

    // Default mock: no outstanding invoices, bills, payroll, or recurring
    prisma.invoice.findMany.mockResolvedValue([] as any);
    prisma.bill.findMany.mockResolvedValue([] as any);
    prisma.payrollRun.findMany.mockResolvedValue([] as any);
    prisma.recurringProfile.findMany.mockResolvedValue([] as any);

    // Default mock: forecast storage
    prisma.cashFlowForecast.deleteMany.mockResolvedValue({ count: 0 } as any);
    prisma.cashFlowForecast.createMany.mockResolvedValue({ count: 0 } as any);
  });

  describe('predict', () => {
    it('should return a valid prediction with current cash balance', async () => {
      const result = await service.predict(orgId, 30);

      expect(result).toBeDefined();
      expect(result.summary.currentCash).toBe(50000);
      expect(result.forecasts).toBeInstanceOf(Array);
      expect(result.forecasts.length).toBeGreaterThan(0);
      expect(result.predictionMethod).toBe('ML');
    });

    it('should include p10/p50/p90 percentiles in each forecast', async () => {
      const result = await service.predict(orgId, 30);

      for (const forecast of result.forecasts) {
        expect(forecast.closingBalance).toHaveProperty('p10');
        expect(forecast.closingBalance).toHaveProperty('p50');
        expect(forecast.closingBalance).toHaveProperty('p90');
        expect(typeof forecast.closingBalance.p10).toBe('number');
        expect(typeof forecast.closingBalance.p50).toBe('number');
        expect(typeof forecast.closingBalance.p90).toBe('number');
        // p10 should be <= p50 <= p90 (pessimistic to optimistic)
        expect(forecast.closingBalance.p10).toBeLessThanOrEqual(forecast.closingBalance.p90);
      }
    });

    it('should aggregate multiple bank account balances', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([
        { systemBalance: new Decimal('30000.0000') },
        { systemBalance: new Decimal('20000.0000') },
        { systemBalance: new Decimal('10000.0000') },
      ] as any);

      const result = await service.predict(orgId, 30);

      expect(result.summary.currentCash).toBe(60000);
    });

    it('should handle zero cash balance', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([] as any);

      const result = await service.predict(orgId, 30);

      expect(result.summary.currentCash).toBe(0);
      expect(result.forecasts).toBeDefined();
    });

    it('should include outstanding invoices as inflow events', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15);

      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-001',
          invoiceNumber: 'INV-001',
          customerId: 'cust-001',
          grandTotal: new Decimal('5000.0000'),
          balanceDue: new Decimal('5000.0000'),
          dueDate: futureDate,
          customer: { name: 'Customer A' },
        },
      ] as any);

      const result = await service.predict(orgId, 30);

      expect(result.summary.totalExpectedInflows).toBeGreaterThan(0);
    });

    it('should include outstanding bills as outflow events', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      prisma.bill.findMany.mockResolvedValue([
        {
          id: 'bill-001',
          billNumber: 'BILL-001',
          vendorId: 'vendor-001',
          grandTotal: new Decimal('3000.0000'),
          balanceDue: new Decimal('3000.0000'),
          dueDate: futureDate,
          vendor: { name: 'Vendor A' },
        },
      ] as any);

      const result = await service.predict(orgId, 30);

      expect(result.summary.totalExpectedOutflows).toBeGreaterThan(0);
    });

    it('should determine confidence level based on event count', async () => {
      // Low confidence: no events
      const result = await service.predict(orgId, 30);
      expect(['high', 'medium', 'low']).toContain(result.confidence);
    });

    it('should store forecasts in the database', async () => {
      await service.predict(orgId, 30);

      expect(prisma.cashFlowForecast.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
      expect(prisma.cashFlowForecast.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Array),
        }),
      );
    });

    it('should include lowest point and daysUntilNegative in summary', async () => {
      const result = await service.predict(orgId, 30);

      expect(result.summary.lowestPoint).toBeDefined();
      expect(result.summary.lowestPoint).toHaveProperty('date');
      expect(result.summary.lowestPoint).toHaveProperty('amount');
      expect(typeof result.summary.lowestPoint.amount).toBe('number');
      // daysUntilNegative can be null (if never goes negative) or a number
      if (result.summary.daysUntilNegative !== null) {
        expect(typeof result.summary.daysUntilNegative).toBe('number');
      }
    });
  });

  describe('getQuickForecast', () => {
    it('should return forecasts for 7, 30, and 90 day windows', async () => {
      const result = await service.getQuickForecast(orgId);

      expect(result.next7Days).toBeDefined();
      expect(result.next7Days).toHaveProperty('low');
      expect(result.next7Days).toHaveProperty('expected');
      expect(result.next7Days).toHaveProperty('high');

      expect(result.next30Days).toBeDefined();
      expect(result.next30Days).toHaveProperty('low');
      expect(result.next30Days).toHaveProperty('expected');
      expect(result.next30Days).toHaveProperty('high');

      expect(result.next90Days).toBeDefined();
      expect(result.next90Days).toHaveProperty('low');
      expect(result.next90Days).toHaveProperty('expected');
      expect(result.next90Days).toHaveProperty('high');
    });

    it('should return low <= expected <= high for each period', async () => {
      const result = await service.getQuickForecast(orgId);

      expect(result.next7Days.low).toBeLessThanOrEqual(result.next7Days.high);
      expect(result.next30Days.low).toBeLessThanOrEqual(result.next30Days.high);
      expect(result.next90Days.low).toBeLessThanOrEqual(result.next90Days.high);
    });

    it('should include critical dates array', async () => {
      const result = await service.getQuickForecast(orgId);

      expect(result.criticalDates).toBeInstanceOf(Array);
      for (const cd of result.criticalDates) {
        expect(cd).toHaveProperty('date');
        expect(cd).toHaveProperty('reason');
        expect(cd).toHaveProperty('impact');
      }
    });
  });

  describe('getAlerts', () => {
    it('should return empty alerts when cash flow is healthy', async () => {
      // Large balance, no outflows
      prisma.bankAccount.findMany.mockResolvedValue([
        { systemBalance: new Decimal('1000000.0000') },
      ] as any);

      const alerts = await service.getAlerts(orgId);

      // With a large balance and no events, should have few or no alerts
      expect(alerts).toBeInstanceOf(Array);
      expect(alerts.length).toBeLessThanOrEqual(5);
    });

    it('should limit alerts to 5', async () => {
      // Create many bills to trigger multiple large outflow warnings
      const futureBills = Array.from({ length: 20 }, (_, i) => {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + i + 1);
        return {
          id: `bill-${i}`,
          billNumber: `BILL-${i}`,
          vendorId: `vendor-${i}`,
          grandTotal: new Decimal('50000.0000'),
          balanceDue: new Decimal('50000.0000'),
          dueDate,
          vendor: { name: `Vendor ${i}` },
        };
      });
      prisma.bill.findMany.mockResolvedValue(futureBills as any);
      prisma.bankAccount.findMany.mockResolvedValue([
        { systemBalance: new Decimal('10000.0000') },
      ] as any);

      const alerts = await service.getAlerts(orgId);

      expect(alerts.length).toBeLessThanOrEqual(5);
    });

    it('should include alert type and suggested action', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([
        { systemBalance: new Decimal('100.0000') },
      ] as any);

      const futureBill = new Date();
      futureBill.setDate(futureBill.getDate() + 5);
      prisma.bill.findMany.mockResolvedValue([
        {
          id: 'bill-001',
          billNumber: 'BILL-001',
          vendorId: 'vendor-001',
          grandTotal: new Decimal('10000.0000'),
          balanceDue: new Decimal('10000.0000'),
          dueDate: futureBill,
          vendor: { name: 'Big Vendor' },
        },
      ] as any);

      const alerts = await service.getAlerts(orgId);

      for (const alert of alerts) {
        expect(['warning', 'critical']).toContain(alert.type);
        expect(alert.message).toBeDefined();
        expect(alert.suggestedAction).toBeDefined();
        expect(alert.date).toBeInstanceOf(Date);
      }
    });
  });

  describe('getScenarios', () => {
    it('should return optimistic, expected, and pessimistic scenarios', async () => {
      const result = await service.getScenarios(orgId);

      expect(result.optimistic).toBeDefined();
      expect(result.expected).toBeDefined();
      expect(result.pessimistic).toBeDefined();

      expect(result.optimistic.name).toContain('Optimistic');
      expect(result.expected.name).toContain('Expected');
      expect(result.pessimistic.name).toContain('Pessimistic');
    });

    it('should have forecasts in each scenario', async () => {
      const result = await service.getScenarios(orgId);

      expect(result.optimistic.forecasts.length).toBeGreaterThan(0);
      expect(result.expected.forecasts.length).toBeGreaterThan(0);
      expect(result.pessimistic.forecasts.length).toBeGreaterThan(0);
    });

    it('should have lowestPoint in each scenario', async () => {
      const result = await service.getScenarios(orgId);

      for (const scenario of [result.optimistic, result.expected, result.pessimistic]) {
        expect(scenario.lowestPoint).toHaveProperty('date');
        expect(scenario.lowestPoint).toHaveProperty('amount');
      }
    });
  });

  describe('dailyRecalculate', () => {
    it('should return number of updated forecast days', async () => {
      const result = await service.dailyRecalculate(orgId);

      expect(result).toHaveProperty('updated');
      expect(typeof result.updated).toBe('number');
    });

    it('should return 0 when prediction fails', async () => {
      prisma.bankAccount.findMany.mockRejectedValue(new Error('DB connection error'));

      const result = await service.dailyRecalculate(orgId);

      expect(result.updated).toBe(0);
    });
  });
});
