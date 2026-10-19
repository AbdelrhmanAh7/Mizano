import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentClassificationService, DocumentCategory } from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { OllamaService } from './ollama.service';
import { AiFeedbackService } from './ai-feedback.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RulesStrategy } from '../extraction/rules-strategy.service';
import { ExtractionContext } from '../extraction/extraction-strategy.interface';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';
import { DOCX_MIME } from '../intake/word-reader';

describe('full Word intake and exact money transport', () => {
  const file = readFileSync(
    resolve(__dirname, '../../../../test/fixtures/formats/table-long.docx'),
  );
  const vendors = jest.fn();
  const bills = jest.fn();
  const classify = jest.fn();
  const match = jest.fn();
  const resolveRules = jest.fn();
  let service: DocumentIntakeService;

  beforeEach(() => {
    vendors
      .mockReset()
      .mockResolvedValue([
        { id: 'vendor-a', name: 'Formats Synthetic Supplier', displayName: null },
      ]);
    bills.mockReset().mockResolvedValue([]);
    classify.mockReset().mockResolvedValue({ category: DocumentCategory.INVOICE, confidence: 0.9 });
    match.mockReset().mockResolvedValue({ matches: [] });
    const rules = new RulesStrategy();
    resolveRules
      .mockReset()
      .mockImplementation((context: ExtractionContext) => rules.extract(context));
    service = new DocumentIntakeService(
      {
        vendor: { findMany: vendors },
        bill: { findFirst: jest.fn().mockResolvedValue(null), findMany: bills },
      } as unknown as PrismaService,
      {} as OllamaService,
      {
        resolve: resolveRules,
      } as unknown as ExtractionStrategyResolver,
      { classifyText: classify } as unknown as DocumentClassificationService,
      { extractAndMatch: match } as unknown as EntityExtractionService,
      {} as AiFeedbackService,
      {} as ConfigService,
    );
  });
  it('keeps an explicit legacy vision request on CPU rules with bilingual reading progress', async () => {
    const progress = jest.fn();
    await service.processDocument(
      'org-a',
      file,
      DOCX_MIME,
      'invoice.docx',
      'eng',
      progress,
      'slow',
    );
    expect(resolveRules).toHaveBeenCalledWith(
      expect.objectContaining({ documentText: expect.any(String) }),
      'rules',
    );
    expect(progress).toHaveBeenCalledWith(
      'extracting',
      20,
      expect.stringContaining('Reading your document'),
    );
    expect(progress).toHaveBeenCalledWith(
      'extracting',
      20,
      expect.stringMatching(/[\u0600-\u06ff]/),
    );
  });

  it('passes the complete DOCX table into CPU rules, preserving evidence and tenant scope', async () => {
    const result = await service.processDocument('org-a', file, DOCX_MIME, 'invoice.docx', 'eng');
    expect(result.rawText.length).toBeGreaterThan(4000);
    expect(result.extractedFields).toMatchObject({
      total: '228.0000',
      subtotal: '200.0000',
      tax: '28.0000',
      documentNumber: 'FMT-17',
    });
    expect(result.formatEvidence).toEqual({ readerVersion: 'cpu-formats-v1' });
    expect(result.fieldEvidence?.total.text).toContain('228.0000');
    expect(result.extractionMethod).toBe('rules');
    expect(vendors).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a', deletedAt: null } }),
    );
    expect(classify).toHaveBeenCalledWith('org-a', result.rawText);
    expect(match).toHaveBeenCalledWith('org-a', result.rawText, { useOllama: false });
  });

  it('rejects legacy Word before extraction or tenant queries', async () => {
    await expect(
      service.processDocument(
        'org-a',
        Buffer.from('d0cf11e0a1b11ae1', 'hex'),
        'application/msword',
      ),
    ).rejects.toThrow('INTAKE_UNSUPPORTED_LEGACY_DOC');
    expect(resolveRules).not.toHaveBeenCalled();
    expect(vendors).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
  });
  it('compares stored bill amounts using Decimal, including sub-cent differences', async () => {
    bills.mockResolvedValue([{ id: 'existing', grandTotal: new Decimal('228.0099') }]);
    const result = await service.processDocument('org-a', file, DOCX_MIME);
    expect(result.duplicateWarning).toMatchObject({
      isDuplicate: true,
      existingId: 'existing',
      matchType: 'amount_match',
    });
    expect(bills).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a', vendorId: 'vendor-a' }),
      }),
    );
    bills.mockResolvedValue([{ id: 'different', grandTotal: new Decimal('228.0100') }]);
    expect((await service.processDocument('org-a', file, DOCX_MIME)).duplicateWarning).toBeNull();
  });
});
