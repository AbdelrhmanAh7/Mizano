import { Test, TestingModule } from '@nestjs/testing';
import { PaymentPredictionService } from './payment-prediction.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('PaymentPredictionService', () => {
  let service: PaymentPredictionService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  function createMockInvoice(overrides: Record<string, any> = {}) {
    return {
      id: 'inv-001',
      organizationId: orgId,
      invoiceNumber: 'INV-001',
      customerId: 'cust-001',
      date: new Date('2025-05-01'),
      dueDate: new Date('2025-05-31'),
      grandTotal: mockDecimal(1000),
      balanceDue: mockDecimal(1000),
      status: 'SENT',
      deletedAt: null,
      customer: {
        id: 'cust-001',
        name: 'Acme Corp',
        paymentTerms: 30,
      },
      paymentAllocations: [],
      ...overrides,
    };
  }

  function createMockPaidInvoice(
    daysToPayment: number,
    invoiceDate: Date,
    overrides: Record<string, any> = {},
  ) {
    const paidDate = new Date(invoiceDate);
    paidDate.setDate(paidDate.getDate() + daysToPayment);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    return {
      id: `inv-paid-${Math.random().toString(36).slice(2, 8)}`,
      organizationId: orgId,
      invoiceNumber: 'INV-PAID',
      customerId: 'cust-001',
      date: invoiceDate,
      dueDate,
      grandTotal: mockDecimal(500),
      status: 'PAID',
      deletedAt: null,
      paymentAllocations: [
        {
          payment: { date: paidDate },
        },
      ],
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentPredictionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OllamaInferenceGateway,
          useValue: {
            generateCompletion: jest.fn().mockResolvedValue(''),
            generateStructuredOutput: jest.fn().mockResolvedValue({}),
            isAvailable: jest.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentPredictionService>(PaymentPredictionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('predictPaymentDate', () => {
    it('should return null when invoice does not exist', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null as any);

      const result = await service.predictPaymentDate(orgId, 'non-existent');

      expect(result).toBeNull();
    });

    it('should return null when invoice has no customer', async () => {
      prisma.invoice.findFirst.mockResolvedValue(createMockInvoice({ customer: null }) as any);

      const result = await service.predictPaymentDate(orgId, 'inv-001');

      expect(result).toBeNull();
    });

    it('should return payment_terms prediction for new customer with no history', async () => {
      prisma.invoice.findFirst.mockResolvedValue(createMockInvoice() as any);
      // No paid invoices for this customer
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictPaymentDate(orgId, 'inv-001');

      expect(result).toBeDefined();
      expect(result!.method).toBe('payment_terms');
      expect(result!.confidence).toBe('low');
      expect(result!.invoiceId).toBe('inv-001');
      expect(result!.customerName).toBe('Acme Corp');
    });

    it('should return statistical prediction for customer with payment history', async () => {
      prisma.invoice.findFirst.mockResolvedValue(createMockInvoice() as any);
      // Create paid invoices with history (>= 3 for statistical method)
      const paidInvoices = [
        createMockPaidInvoice(25, new Date('2025-01-01')),
        createMockPaidInvoice(28, new Date('2025-02-01')),
        createMockPaidInvoice(30, new Date('2025-03-01')),
        createMockPaidInvoice(27, new Date('2025-04-01')),
      ];
      prisma.invoice.findMany.mockResolvedValue(paidInvoices as any);

      const result = await service.predictPaymentDate(orgId, 'inv-001');

      expect(result).toBeDefined();
      expect(result!.method).toBe('statistical');
      expect(result!.factors.historical).toBeGreaterThan(0);
    });

    it('should include amount and day-of-week factors', async () => {
      prisma.invoice.findFirst.mockResolvedValue(createMockInvoice() as any);
      const paidInvoices = [
        createMockPaidInvoice(25, new Date('2025-01-01')),
        createMockPaidInvoice(28, new Date('2025-02-01')),
        createMockPaidInvoice(30, new Date('2025-03-01')),
      ];
      prisma.invoice.findMany.mockResolvedValue(paidInvoices as any);

      const result = await service.predictPaymentDate(orgId, 'inv-001');

      expect(result).toBeDefined();
      expect(result!.factors).toHaveProperty('historical');
      expect(result!.factors).toHaveProperty('amount');
      expect(result!.factors).toHaveProperty('dayOfWeek');
      expect(result!.factors).toHaveProperty('monthEnd');
    });

    it('should return daysFromNow as a positive number', async () => {
      const futureInvoice = createMockInvoice({
        date: new Date(), // today
        dueDate: new Date(Date.now() + 30 * 86400000), // 30 days from now
      });
      prisma.invoice.findFirst.mockResolvedValue(futureInvoice as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictPaymentDate(orgId, 'inv-001');

      expect(result).toBeDefined();
      expect(result!.daysFromNow).toBeGreaterThanOrEqual(0);
    });

    it('should set predictedDate in future even if historical average is past', async () => {
      // Invoice from long ago where average would predict a past date
      prisma.invoice.findFirst.mockResolvedValue(
        createMockInvoice({
          date: new Date('2024-01-01'),
          dueDate: new Date('2024-01-31'),
        }) as any,
      );
      const paidInvoices = [
        createMockPaidInvoice(25, new Date('2023-10-01')),
        createMockPaidInvoice(28, new Date('2023-11-01')),
        createMockPaidInvoice(30, new Date('2023-12-01')),
      ];
      prisma.invoice.findMany.mockResolvedValue(paidInvoices as any);

      const result = await service.predictPaymentDate(orgId, 'inv-001');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(result).toBeDefined();
      expect(result!.predictedDate.getTime()).toBeGreaterThanOrEqual(today.getTime());
    });
  });

  describe('predictAllOutstanding', () => {
    it('should return predictions for all outstanding invoices', async () => {
      const invoices = [
        createMockInvoice({ id: 'inv-1', invoiceNumber: 'INV-001' }),
        createMockInvoice({
          id: 'inv-2',
          invoiceNumber: 'INV-002',
          customerId: 'cust-002',
          customer: { id: 'cust-002', name: 'Beta Inc', paymentTerms: 45 },
        }),
      ];
      // First call: outstanding invoices
      prisma.invoice.findMany.mockResolvedValueOnce(invoices as any);
      // Second call for each customer's payment history
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictAllOutstanding(orgId);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(2);
      result.forEach((pred) => {
        expect(pred).toHaveProperty('invoiceId');
        expect(pred).toHaveProperty('predictedDate');
        expect(pred).toHaveProperty('confidence');
      });
    });

    it('should return empty array when no outstanding invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.predictAllOutstanding(orgId);

      expect(result).toHaveLength(0);
    });

    it('should sort predictions by predicted date ascending', async () => {
      const invoices = [
        createMockInvoice({
          id: 'inv-later',
          date: new Date('2025-06-01'),
          dueDate: new Date('2025-07-01'),
          customer: { id: 'cust-001', name: 'Acme Corp', paymentTerms: 60 },
        }),
        createMockInvoice({
          id: 'inv-sooner',
          date: new Date('2025-06-01'),
          dueDate: new Date('2025-06-15'),
          customer: { id: 'cust-002', name: 'Beta Inc', paymentTerms: 15 },
          customerId: 'cust-002',
        }),
      ];
      prisma.invoice.findMany.mockResolvedValueOnce(invoices as any);
      prisma.invoice.findMany.mockResolvedValue([] as any); // no history

      const result = await service.predictAllOutstanding(orgId);

      if (result.length >= 2) {
        expect(result[0].predictedDate.getTime()).toBeLessThanOrEqual(
          result[1].predictedDate.getTime(),
        );
      }
    });
  });

  describe('getCustomerPaymentProfile', () => {
    it('should return null when customer does not exist', async () => {
      prisma.customer.findFirst.mockResolvedValue(null as any);

      const result = await service.getCustomerPaymentProfile(orgId, 'non-existent');

      expect(result).toBeNull();
    });

    it('should return profile with zero values for customer with no payment history', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-001',
        name: 'New Customer',
      } as any);
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.getCustomerPaymentProfile(orgId, 'cust-001');

      expect(result).toBeDefined();
      expect(result!.customerId).toBe('cust-001');
      expect(result!.customerName).toBe('New Customer');
      expect(result!.avgDaysToPayment).toBe(0);
      expect(result!.paymentCount).toBe(0);
      expect(result!.onTimeRate).toBe(0);
      expect(result!.trend).toBe('stable');
    });

    it('should calculate average days to payment from history', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-001',
        name: 'Regular Customer',
      } as any);
      const paidInvoices = [
        createMockPaidInvoice(20, new Date('2025-01-01')),
        createMockPaidInvoice(25, new Date('2025-02-01')),
        createMockPaidInvoice(30, new Date('2025-03-01')),
      ];
      prisma.invoice.findMany.mockResolvedValue(paidInvoices as any);

      const result = await service.getCustomerPaymentProfile(orgId, 'cust-001');

      expect(result).toBeDefined();
      expect(result!.paymentCount).toBe(3);
      expect(result!.avgDaysToPayment).toBeCloseTo(25, 0);
    });

    it('should calculate on-time rate correctly', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-001',
        name: 'Mixed Customer',
      } as any);
      // 2 on-time (paid before due), 1 late (paid after due)
      const paidInvoices = [
        createMockPaidInvoice(20, new Date('2025-01-01')), // on-time (due date = +30)
        createMockPaidInvoice(25, new Date('2025-02-01')), // on-time
        createMockPaidInvoice(35, new Date('2025-03-01')), // late
      ];
      prisma.invoice.findMany.mockResolvedValue(paidInvoices as any);

      const result = await service.getCustomerPaymentProfile(orgId, 'cust-001');

      expect(result).toBeDefined();
      // 2 out of 3 paid on time = ~66.7%
      expect(result!.onTimeRate).toBeCloseTo(66.7, 0);
    });

    it('should detect improving trend when recent payments are faster', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-001',
        name: 'Improving Customer',
      } as any);
      // Old payments slow, recent payments fast — need 6+ records for trend
      const paidInvoices = [
        createMockPaidInvoice(15, new Date('2025-06-01')),
        createMockPaidInvoice(18, new Date('2025-05-01')),
        createMockPaidInvoice(20, new Date('2025-04-01')),
        createMockPaidInvoice(35, new Date('2025-03-01')),
        createMockPaidInvoice(40, new Date('2025-02-01')),
        createMockPaidInvoice(45, new Date('2025-01-01')),
      ];
      prisma.invoice.findMany.mockResolvedValue(paidInvoices as any);

      const result = await service.getCustomerPaymentProfile(orgId, 'cust-001');

      expect(result).toBeDefined();
      expect(result!.trend).toBe('improving');
    });
  });

  describe('getCollectionPriority', () => {
    it('should return empty array when no outstanding invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.getCollectionPriority(orgId);

      expect(result).toHaveLength(0);
    });

    it('should return priority items sorted by priority score descending', async () => {
      const invoices = [
        createMockInvoice({
          id: 'inv-small',
          grandTotal: mockDecimal(100),
          dueDate: new Date(Date.now() - 5 * 86400000), // 5 days overdue
        }),
        createMockInvoice({
          id: 'inv-large',
          grandTotal: mockDecimal(10000),
          dueDate: new Date(Date.now() - 45 * 86400000), // 45 days overdue
          customerId: 'cust-002',
          customer: { id: 'cust-002', name: 'Late Corp', paymentTerms: 30 },
        }),
      ];
      prisma.invoice.findMany.mockResolvedValue(invoices as any);
      prisma.customer.findFirst.mockResolvedValue(null as any);

      const result = await service.getCollectionPriority(orgId);

      expect(result.length).toBe(2);
      // The large overdue invoice should be first
      expect(result[0].priorityScore).toBeGreaterThanOrEqual(result[1].priorityScore);
    });

    it('should classify risk levels correctly', async () => {
      // Severely overdue invoice
      const invoices = [
        createMockInvoice({
          id: 'inv-overdue',
          dueDate: new Date(Date.now() - 60 * 86400000), // 60 days overdue
        }),
      ];
      prisma.invoice.findMany.mockResolvedValue(invoices as any);
      prisma.customer.findFirst.mockResolvedValue(null as any);

      const result = await service.getCollectionPriority(orgId);

      expect(result[0].riskLevel).toBe('high');
      expect(result[0].recommendedAction).toContain('Call customer');
    });

    it('should include recommended action for each item', async () => {
      const invoices = [createMockInvoice()];
      prisma.invoice.findMany.mockResolvedValue(invoices as any);
      prisma.customer.findFirst.mockResolvedValue(null as any);

      const result = await service.getCollectionPriority(orgId);

      expect(result[0]).toHaveProperty('recommendedAction');
      expect(typeof result[0].recommendedAction).toBe('string');
    });
  });

  describe('updatePredictions', () => {
    it('should recalculate predictions and return updated count', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.updatePredictions(orgId);

      expect(result).toHaveProperty('updated');
      expect(result.updated).toBe(0);
    });
  });
});
