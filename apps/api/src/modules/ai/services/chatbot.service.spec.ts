import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotService, ChatIntent } from './chatbot.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  createMockAiFeedback,
  createMockEventEmitter,
  MockPrismaClient,
  TEST_ORG_ID,
  TEST_USER_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('ChatbotService', () => {
  let service: ChatbotService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;
  const userId = TEST_USER_ID;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiFeedbackService, useValue: createMockAiFeedback() },
        { provide: EventEmitter2, useValue: createMockEventEmitter() },
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

    service = module.get<ChatbotService>(ChatbotService);
  });

  // ---------------------------------------------------------------------------
  // processMessage
  // ---------------------------------------------------------------------------
  describe('processMessage', () => {
    it('should detect invoice_status intent for "check invoice INV-001"', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        status: 'SENT',
        grandTotal: mockDecimal(5000),
        dueDate: new Date('2025-07-01'),
        customer: { name: 'Acme Corp' },
      } as any);

      const result = await service.processMessage(orgId, userId, 'check invoice INV-001');

      expect(result.intent).toBe('invoice_status');
      expect(result.response).toContain('INV-001');
      expect(result.data).toBeDefined();
    });

    it('should detect account_balance intent for "what is the balance of account Cash"', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        name: 'Cash',
        code: '1000',
        type: 'ASSET',
        openingBalance: mockDecimal(25000),
      } as any);

      prisma.journalLine.aggregate.mockResolvedValue({
        _sum: { debit: mockDecimal(10000), credit: mockDecimal(3000) },
      } as any);

      const result = await service.processMessage(
        orgId,
        userId,
        'what is the balance of account Cash',
      );

      expect(result.intent).toBe('account_balance');
    });

    it('should detect payment_reminder intent for "outstanding payments"', async () => {
      prisma.invoice.findMany.mockResolvedValue([] as any);

      const result = await service.processMessage(orgId, userId, 'outstanding payments');

      expect(result.intent).toBe('payment_reminder');
    });

    it('should detect greeting intent for "hello"', async () => {
      const result = await service.processMessage(orgId, userId, 'hello');

      expect(result.intent).toBe('greeting');
      expect(result.response).toBeTruthy();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should detect help intent for "help"', async () => {
      const result = await service.processMessage(orgId, userId, 'help');

      expect(result.intent).toBe('help');
      expect(result.response).toContain('help');
    });

    it('should detect create_invoice intent for "create invoice"', async () => {
      const result = await service.processMessage(orgId, userId, 'create invoice');

      expect(result.intent).toBe('create_invoice');
      expect(result.data?.requiresConfirmation).toBe(true);
    });

    it('should detect report_request intent for "generate report"', async () => {
      const result = await service.processMessage(orgId, userId, 'generate report');

      expect(result.intent).toBe('report_request');
      expect(result.response).toContain('report');
    });

    it('should return a valid intent for gibberish (BayesClassifier always classifies)', async () => {
      // BayesClassifier.getClassifications() always returns a non-empty array,
      // so the "unknown" intent is unreachable via processMessage.
      // Gibberish text gets classified as the most frequent training category.
      const result = await service.processMessage(orgId, userId, 'xyzzy plugh qwerty');

      const validIntents: ChatIntent[] = [
        'invoice_status',
        'payment_reminder',
        'account_balance',
        'create_invoice',
        'report_request',
        'help',
        'greeting',
        'unknown',
      ];
      expect(validIntents).toContain(result.intent);
      expect(result.response).toBeTruthy();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should always return suggestions array', async () => {
      const result = await service.processMessage(orgId, userId, 'hello');

      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should ask for invoice number when none provided', async () => {
      const result = await service.processMessage(orgId, userId, 'check invoice status');

      expect(result.intent).toBe('invoice_status');
      expect(result.response).toContain('invoice number');
    });

    it('should return not found when invoice does not exist', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null as any);

      const result = await service.processMessage(orgId, userId, 'check invoice INV-999');

      expect(result.response).toContain('could not find');
    });

    it('should store messages in chat history', async () => {
      await service.processMessage(orgId, userId, 'hello');

      const history = service.getHistory(orgId, userId);
      expect(history.length).toBe(2); // user + assistant
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('hello');
      expect(history[1].role).toBe('assistant');
    });
  });

  // ---------------------------------------------------------------------------
  // getHistory
  // ---------------------------------------------------------------------------
  describe('getHistory', () => {
    it('should return empty array for new user', () => {
      const history = service.getHistory(orgId, userId);

      expect(history).toHaveLength(0);
    });

    it('should return recent messages after processMessage', async () => {
      await service.processMessage(orgId, userId, 'hello');
      await service.processMessage(orgId, userId, 'help');

      const history = service.getHistory(orgId, userId);

      expect(history.length).toBe(4); // 2 user + 2 assistant
    });

    it('should respect limit parameter', async () => {
      await service.processMessage(orgId, userId, 'hello');
      await service.processMessage(orgId, userId, 'help');
      await service.processMessage(orgId, userId, 'hi');

      const history = service.getHistory(orgId, userId, 2);

      expect(history.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // clearHistory
  // ---------------------------------------------------------------------------
  describe('clearHistory', () => {
    it('should remove all chat history for a user', async () => {
      await service.processMessage(orgId, userId, 'hello');
      expect(service.getHistory(orgId, userId).length).toBeGreaterThan(0);

      service.clearHistory(orgId, userId);

      expect(service.getHistory(orgId, userId)).toHaveLength(0);
    });

    it('should not affect other users history', async () => {
      await service.processMessage(orgId, userId, 'hello');
      await service.processMessage(orgId, 'other-user', 'hi');

      service.clearHistory(orgId, userId);

      expect(service.getHistory(orgId, userId)).toHaveLength(0);
      expect(service.getHistory(orgId, 'other-user').length).toBeGreaterThan(0);
    });
  });
});
