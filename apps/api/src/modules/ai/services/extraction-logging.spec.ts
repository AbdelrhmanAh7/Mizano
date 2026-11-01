import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGatewayService } from '../account/ai-gateway.service';
import { AiSettingsService, connectionFingerprint } from '../account/ai-settings.service';
import { AiDocumentReader } from '../extraction/ai-document-reader';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';
import { RulesStrategy } from '../extraction/rules-strategy.service';
import { AiProviderAdapter, AiProviderError } from '../providers/ai-provider';
import { AiFeedbackService } from './ai-feedback.service';
import { DocumentClassificationService } from './document-classification.service';
import { DocumentIntakeService } from './document-intake.service';
import { EntityExtractionService } from './entity-extraction.service';

/**
 * AGENTS.md: "Never log invoice text, credentials, bot tokens or auth headers."
 *
 * Drives the real intake service, resolver, AI reader and call gateway (only the provider,
 * settings and database are faked) with a document full of recognisable sentinel values, and
 * asserts that nothing printed through the Nest Logger contains any of them or the key.
 */
const SENTINELS = {
  vendor: 'Lotus Trading Supplies LLC ZXQ',
  taxId: '300-123-456-789',
  invoiceNumber: 'INV-ZXQ-90210',
  lineDescription: 'Industrial widget ZXQ-sku-5521',
  email: 'accounts@lotus-zxq.example',
  total: '8765.43',
  apiKey: 'sk-ant-SECRET-KEY-ZXQ',
};

const ANSWER = JSON.stringify({
  documentType: 'BILL',
  vendorName: SENTINELS.vendor,
  vendorEmail: SENTINELS.email,
  vendorTaxId: SENTINELS.taxId,
  invoiceNumber: SENTINELS.invoiceNumber,
  date: '2026-09-01',
  currency: 'EGP',
  subtotal: 7688,
  tax: 1077.43,
  total: 8765.43,
  lines: [
    {
      description: SENTINELS.lineDescription,
      quantity: 4,
      unitPrice: 1922,
      total: 7688,
      accountCode: '5100',
    },
  ],
});

const FORBIDDEN = [
  'ZXQ',
  SENTINELS.taxId,
  SENTINELS.email,
  SENTINELS.total,
  '7688',
  '1922',
  'SECRET',
];

function captureAllLogging(): () => string {
  const spies = (['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const).map((method) =>
    jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined),
  );
  return () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

/** The organization's AI settings row the gateway re-reads under its lock. */
const SETTINGS_ROW = {
  organizationId: 'org-1',
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  keyCiphertext: 'v1.iv.tag.ct',
  consentProvider: 'anthropic',
  consentAt: new Date('2026-10-31T10:00:00Z'),
  features: ['documents', 'categorization'],
  monthlyLimitUsd: new Decimal(5),
};

function buildPrisma(): PrismaService {
  const model = {
    findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', code: '5100', name: 'Supplies ZXQ' }]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(SETTINGS_ROW),
    aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: null } }),
    create: jest.fn().mockResolvedValue({ id: 'usage-1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === '$transaction') return (fn: (tx: unknown) => unknown) => fn(prisma);
        if (key === '$queryRaw') return jest.fn().mockResolvedValue([]);
        return model;
      },
    },
  );
  return prisma as unknown as PrismaService;
}

describe('AI intake logging never contains document content or the key', () => {
  let complete: jest.Mock;
  let service: DocumentIntakeService;
  let rules: { extract: jest.Mock };
  let printed: () => string;

  beforeEach(() => {
    printed = captureAllLogging();
    complete = jest.fn().mockResolvedValue({
      text: ANSWER,
      inputTokens: 1200,
      outputTokens: 300,
      reportedCostUsd: null,
    });
    const adapter = {
      id: 'anthropic',
      acceptsImages: true,
      acceptsPdf: true,
      listModels: jest.fn(),
      complete,
    } as unknown as AiProviderAdapter;
    const settings = {
      features: jest.fn().mockResolvedValue({ activeFeatures: ['documents', 'categorization'] }),
      connection: jest.fn().mockResolvedValue({
        provider: 'anthropic',
        adapter,
        model: 'claude-haiku-4-5',
        apiKey: SENTINELS.apiKey,
        price: null,
        fingerprint: connectionFingerprint(SETTINGS_ROW),
      }),
    } as unknown as AiSettingsService;
    const prisma = buildPrisma();
    const gateway = new AiGatewayService(prisma, settings);
    // The rules fallback reads a total, so the fallback paths still produce a result.
    rules = {
      extract: jest.fn().mockResolvedValue({
        extraction: {
          vendorName: null,
          invoiceNumber: null,
          date: null,
          dueDate: null,
          total: 1,
          subtotal: null,
          tax: null,
          currency: null,
          lineItems: [],
          rawText: '',
          ocrConfidence: 0.5,
          fieldConfidence: {},
          documentCategory: 'INVOICE',
        },
        strategyUsed: 'rules',
        totalTimeMs: 1,
      }),
    };
    const resolver = new ExtractionStrategyResolver(
      { get: () => undefined } as unknown as ConfigService,
      rules as unknown as RulesStrategy,
      new AiDocumentReader(prisma, settings, gateway),
    );
    service = new DocumentIntakeService(
      prisma,
      resolver,
      {
        classifyDocument: jest.fn().mockResolvedValue({ category: 'INVOICE', confidence: 0.9 }),
      } as unknown as DocumentClassificationService,
      {
        extractAndMatch: jest.fn().mockResolvedValue({ matches: [] }),
      } as unknown as EntityExtractionService,
      { processFeedback: jest.fn() } as unknown as AiFeedbackService,
      {} as ConfigService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  function expectNothingSensitive(output: string): void {
    for (const fragment of FORBIDDEN) {
      expect({ fragment, leaked: output.includes(fragment) }).toEqual({ fragment, leaked: false });
    }
  }

  it('happy path: the AI reading fills the draft while logs carry metadata only', async () => {
    const result = await service.processDocument(
      'org-1',
      Buffer.from('fake-image-bytes'),
      'image/png',
      `${SENTINELS.invoiceNumber}.png`,
    );

    expect(result.extractionMethod).toBe('ai');
    expect(result.extractedFields.vendorName).toBe(SENTINELS.vendor);
    expect(result.extractedFields.lineItems[0].suggestedAccountId).toBe('acc-1');
    expect(rules.extract).not.toHaveBeenCalled();
    const output = printed();
    expect(output).toContain('outcome=ok');
    expectNothingSensitive(output);
  });

  it('an answer that is not the expected JSON falls back to rules without echoing it', async () => {
    complete.mockResolvedValue({
      text: `I cannot read this. ${SENTINELS.vendor} ${SENTINELS.total}`,
      inputTokens: 10,
      outputTokens: 10,
      reportedCostUsd: null,
    });

    const result = await service.processDocument('org-1', Buffer.from('x'), 'image/png');

    expect(result.extractionMethod).toBe('rules');
    expect(rules.extract).toHaveBeenCalledTimes(1);
    const output = printed();
    expect(output).toContain('AI_INVALID_OUTPUT');
    expectNothingSensitive(output);
  });

  it('a provider failure is logged by kind only', async () => {
    complete.mockRejectedValue(new AiProviderError('invalid_key', 401));

    await service.processDocument('org-1', Buffer.from('x'), 'image/png');

    const output = printed();
    expect(output).toContain('AI_KEY_INVALID');
    expectNothingSensitive(output);
  });
});
