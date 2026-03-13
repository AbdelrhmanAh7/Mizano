import { Test, TestingModule } from '@nestjs/testing';
import {
  TransactionCategorizerService,
  CategorizationInput,
} from './transaction-categorizer.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('TransactionCategorizerService', () => {
  let service: TransactionCategorizerService;
  let prisma: MockPrismaClient;
  let feedbackService: {
    storePrediction: jest.Mock;
  };

  const orgId = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    feedbackService = {
      storePrediction: jest.fn().mockResolvedValue({ id: 'pred-001' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionCategorizerService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiFeedbackService, useValue: feedbackService },
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

    service = module.get<TransactionCategorizerService>(TransactionCategorizerService);
  });

  describe('predict', () => {
    it('should return RULE_BASED prediction when no model is available', async () => {
      const input: CategorizationInput = {
        description: 'Office supplies purchase',
        amount: 150,
        direction: 'expense',
      };

      const result = await service.predict(orgId, input);

      expect(result).toBeDefined();
      expect(result.predictionMethod).toBe('RULE_BASED');
      expect(result.accountId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.alternatives).toEqual([]);
    });

    it('should return RULE_BASED prediction with no trained model (Ollama unavailable)', async () => {
      const input: CategorizationInput = {
        description: 'Office supplies purchase',
        amount: 150,
        direction: 'expense',
      };

      const result = await service.predict(orgId, input);

      expect(result).toBeDefined();
      expect(result.predictionMethod).toBe('RULE_BASED');
      expect(result.confidence).toBe(0);
    });
  });

  describe('onUserCategorize', () => {
    it('should not throw on user categorization', async () => {
      const input: CategorizationInput = {
        description: 'Office rent payment',
        amount: 5000,
        direction: 'expense',
      };

      await expect(
        service.onUserCategorize(orgId, input, 'acc-rent', false),
      ).resolves.not.toThrow();
    });

    it('should not throw when AI suggestion was overridden', async () => {
      const input: CategorizationInput = {
        description: 'Office rent payment',
        amount: 5000,
        direction: 'expense',
      };

      await expect(
        service.onUserCategorize(
          orgId,
          input,
          'acc-rent',
          true,
          'acc-utilities', // AI suggested utilities but user chose rent
        ),
      ).resolves.not.toThrow();
    });
  });

  // Note: getStats and loadModel tests removed because they depend on
  // modelRegistry which references the removed aiTrainingData infrastructure.
});
