import { Readable } from 'stream';
import { of } from 'rxjs';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentIntakeService } from './document-intake.service';
import { OllamaService } from './ollama.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { PaddleOcrService } from './paddle-ocr.service';
import { DocumentClassificationService } from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { AiFeedbackService } from './ai-feedback.service';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';
import { OcrLlmStrategy } from '../extraction/ocr-llm-strategy.service';
import { ExtractionContext } from '../extraction/extraction-strategy.interface';

/**
 * AGENTS.md: "Never log invoice text, credentials, bot tokens or auth headers."
 *
 * These tests drive the real intake service, the real OCR+LLM strategy and the real Ollama
 * service end to end (only OCR engine, LLM gateway and database are faked) with a document
 * full of recognisable sentinel values, and assert that nothing printed through the Nest
 * Logger contains any of them.
 */

// Distinct, greppable sentinels for every kind of document content.
const SENTINELS = {
  ocrLine: 'ZXQ-OCR-LINE-7731 Lotus Trading Supplies LLC',
  vendor: 'Lotus Trading Supplies LLC',
  taxId: '300-123-456-789',
  invoiceNumber: 'INV-ZXQ-90210',
  lineDescription: 'Industrial widget ZXQ-sku-5521',
  email: 'accounts@lotus-zxq.example',
  phone: '+20-100-555-0199',
  total: '8765.43',
  subtotal: '7688.0',
  tax: '1077.43',
  notes: 'Payment to IBAN EG380019000500000000263180002 ZXQ',
};

const OCR_TEXT = [
  SENTINELS.ocrLine,
  `Tax ID ${SENTINELS.taxId}`,
  `Invoice ${SENTINELS.invoiceNumber}`,
  `${SENTINELS.lineDescription} 4 x 1922.00`,
  `Subtotal ${SENTINELS.subtotal} VAT ${SENTINELS.tax} Total ${SENTINELS.total}`,
  SENTINELS.notes,
].join('\n');

const RAW_LLM_JSON = {
  vendorName: SENTINELS.vendor,
  vendorAddress: '12 Zamalek Street ZXQ',
  vendorPhone: SENTINELS.phone,
  vendorEmail: SENTINELS.email,
  vendorTaxId: SENTINELS.taxId,
  invoiceNumber: SENTINELS.invoiceNumber,
  date: '2026-09-01',
  dueDate: null,
  total: 8765.43,
  subtotal: 7688,
  tax: 1077.43,
  discount: null,
  currency: 'EGP',
  paymentTerms: null,
  notes: SENTINELS.notes,
  documentCategory: 'INVOICE',
  lineItems: [
    {
      description: SENTINELS.lineDescription,
      quantity: 4,
      unitPrice: 1922,
      taxAmount: 0,
      total: 7688,
    },
  ],
};

/** Values that must never appear in a log line. */
const FORBIDDEN_FRAGMENTS = [
  'ZXQ',
  SENTINELS.vendor,
  SENTINELS.taxId,
  SENTINELS.invoiceNumber,
  SENTINELS.lineDescription,
  SENTINELS.email,
  SENTINELS.phone,
  SENTINELS.total,
  '7688',
  '1077.43',
  '1922',
  'IBAN',
  'Zamalek',
];

type LoggerMethod = 'log' | 'warn' | 'error' | 'debug' | 'verbose' | 'fatal';

function captureAllLogging(): () => string {
  const spies = (['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as LoggerMethod[]).map(
    (method) => jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined),
  );
  return () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

function buildPrisma(): PrismaService {
  const model = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  };
  return new Proxy({}, { get: () => model }) as unknown as PrismaService;
}

describe('extraction and intake logging never contains document content', () => {
  let paddle: { isAvailable: jest.Mock; canRenderPdf: jest.Mock; recognize: jest.Mock };
  let gateway: { textModel: string; infer: jest.Mock };
  let strategy: OcrLlmStrategy;
  let service: DocumentIntakeService;
  let printed: () => string;

  beforeEach(() => {
    printed = captureAllLogging();

    paddle = {
      isAvailable: jest.fn().mockResolvedValue(true),
      canRenderPdf: jest.fn().mockReturnValue(false),
      recognize: jest.fn().mockResolvedValue({
        text: OCR_TEXT,
        confidence: 91,
        regions: [{ text: SENTINELS.ocrLine, bbox: [0, 0, 1, 1], confidence: 91 }],
        processingTimeMs: 12,
      }),
    };
    gateway = {
      textModel: 'test-model',
      infer: jest.fn().mockResolvedValue({
        data: RAW_LLM_JSON,
        processingTimeMs: 25,
        model: 'test-model',
      }),
    };

    const ollama = new OllamaService(gateway as unknown as OllamaInferenceGateway);
    strategy = new OcrLlmStrategy(ollama, paddle as unknown as PaddleOcrService);

    service = new DocumentIntakeService(
      buildPrisma(),
      ollama,
      {
        resolve: (context: ExtractionContext) => strategy.extract(context),
      } as unknown as ExtractionStrategyResolver,
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

  function expectNoDocumentContent(output: string): void {
    for (const fragment of FORBIDDEN_FRAGMENTS) {
      expect({ fragment, leaked: output.includes(fragment) }).toEqual({ fragment, leaked: false });
    }
  }

  it('happy path: image -> OCR -> LLM -> intake result logs only metadata', async () => {
    const result = await service.processDocument(
      'org-1',
      Buffer.from('fake-image-bytes'),
      'image/png',
      'lotus-invoice-ZXQ.png',
    );

    // The pipeline really ran with the sensitive content...
    expect(result.extractedFields.vendorName).toBe(SENTINELS.vendor);
    expect(result.rawText).toContain(SENTINELS.ocrLine);
    expect(gateway.infer).toHaveBeenCalledTimes(1);
    expect(String(gateway.infer.mock.calls[0][0])).toContain(SENTINELS.taxId);

    // ...while the logs carry none of it, but do show that logging happened.
    const output = printed();
    expect(output.length).toBeGreaterThan(50);
    expect(output).toContain('Processing document intake');
    expectNoDocumentContent(output);
  });

  it('logs no file name even when the name contains document data', async () => {
    await service.processDocument(
      'org-1',
      Buffer.from('x'),
      'image/png',
      `${SENTINELS.invoiceNumber}-${SENTINELS.vendor}.png`,
    );
    expectNoDocumentContent(printed());
  });

  it('inconsistent LLM totals take the number-fix path without logging amounts', async () => {
    gateway.infer.mockResolvedValue({
      data: {
        ...RAW_LLM_JSON,
        total: 8765.43,
        subtotal: 100,
        tax: 7,
        lineItems: [
          { description: 'item', quantity: 20, unitPrice: 438.27, taxAmount: 0, total: 40 },
          { description: SENTINELS.lineDescription, quantity: 1, unitPrice: 7688, total: 7688 },
        ],
      },
      processingTimeMs: 5,
      model: 'test-model',
    });

    await service.processDocument('org-1', Buffer.from('x'), 'image/png');

    const output = printed();
    expect(output).toContain('NumberFix');
    expectNoDocumentContent(output);
    expect(output).not.toContain('8765');
    expect(output).not.toContain('438.27');
  });

  it('column-header line items are dropped without logging their descriptions', async () => {
    gateway.infer.mockResolvedValue({
      data: {
        ...RAW_LLM_JSON,
        lineItems: [
          { description: 'Qty', quantity: 1, unitPrice: 1, taxAmount: 0, total: 1 },
          { description: SENTINELS.lineDescription, quantity: 4, unitPrice: 1922, total: 7688 },
        ],
      },
      processingTimeMs: 5,
      model: 'test-model',
    });

    await service.processDocument('org-1', Buffer.from('x'), 'image/png');

    const output = printed();
    expect(output).toContain('LineFix');
    expect(output).not.toContain('Qty');
    expect(output).not.toContain('Removing fake line item:');
    expectNoDocumentContent(output);
  });

  it('unparseable LLM output is not echoed into the log', async () => {
    // Drive the real gateway with a streamed response that is not JSON and quotes the document.
    const ndjson =
      JSON.stringify({ message: { content: `not json at all: ${OCR_TEXT}` }, done: false }) +
      '\n' +
      JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop' }) +
      '\n';
    const httpService = {
      axiosRef: { defaults: { headers: { common: {} as Record<string, string> } } },
      post: jest.fn(() => of({ data: Readable.from([Buffer.from(ndjson)]) })),
    };
    const realGateway = new OllamaInferenceGateway(
      { get: (_key: string, fallback?: string) => fallback } as unknown as ConfigService,
      httpService as unknown as HttpService,
    );
    const doInferOnce = (
      realGateway as unknown as {
        doInferOnce: (
          prompt: string,
          images: string[],
          model: string,
          options: undefined,
          attempt: number,
        ) => Promise<unknown>;
      }
    ).doInferOnce.bind(realGateway);

    await expect(doInferOnce('extract this', [], 'test-model', undefined, 1)).resolves.toBeNull();

    const output = printed();
    expect(output).toContain('unparseable JSON');
    expect(output).toContain('contentLen=');
    expectNoDocumentContent(output);
    expect(output).not.toContain('not json at all');
  });

  it('OCR engine failures are logged by type only, never with the text they choked on', async () => {
    paddle.isAvailable.mockResolvedValue(false);
    jest
      .spyOn(strategy as unknown as { runTesseract: () => Promise<unknown> }, 'runTesseract')
      .mockRejectedValue(new SyntaxError(`Unexpected token in "${OCR_TEXT}"`));

    const result = await service.processDocument('org-1', Buffer.from('x'), 'image/png');

    expect(result.rawText).toBe('');
    const output = printed();
    expect(output).toContain('Tesseract.js OCR failed');
    expect(output).toContain('SyntaxError');
    expectNoDocumentContent(output);
  });

  it('service-level failures never log the error message of Prisma-style errors', async () => {
    gateway.infer.mockResolvedValue({
      data: RAW_LLM_JSON,
      processingTimeMs: 1,
      model: 'test-model',
    });
    const failingPrisma = new Proxy(
      {},
      {
        get: () => ({
          findMany: jest
            .fn()
            .mockRejectedValue(
              Object.assign(
                new Error(`Invalid prisma.vendor.findMany() args: { name: "${SENTINELS.vendor}" }`),
                { name: 'PrismaClientValidationError' },
              ),
            ),
          findFirst: jest.fn().mockResolvedValue(null),
        }),
      },
    ) as unknown as PrismaService;
    const failing = new DocumentIntakeService(
      failingPrisma,
      new OllamaService(gateway as unknown as OllamaInferenceGateway),
      {
        resolve: (context: ExtractionContext) => strategy.extract(context),
      } as unknown as ExtractionStrategyResolver,
      {
        classifyDocument: jest.fn().mockResolvedValue({ category: 'INVOICE', confidence: 0.9 }),
      } as unknown as DocumentClassificationService,
      {
        extractAndMatch: jest.fn().mockResolvedValue({ matches: [] }),
      } as unknown as EntityExtractionService,
      { processFeedback: jest.fn() } as unknown as AiFeedbackService,
      {} as ConfigService,
    );

    await failing.processDocument('org-1', Buffer.from('x'), 'image/png').catch(() => undefined);

    expectNoDocumentContent(printed());
  });
});
