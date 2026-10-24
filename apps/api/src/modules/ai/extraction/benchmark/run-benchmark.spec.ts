import Decimal from 'decimal.js';
import * as invoiceRules from '../rules/invoice-rules-extractor';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { main, benchmarkError, toFieldValues } from './run-benchmark';
import { RulesStrategy } from '../rules-strategy.service';
import { compareFields, FieldValues } from './scoring';
import { extractCpuDocument } from '../../intake/cpu-extraction';
import type {
  DocumentIntakeResult,
  IntakeDocumentType,
} from '../../services/document-intake.service';

jest.mock('../../intake/intake-processor.service', () => ({ needsReview: jest.fn(() => true) }));
jest.mock('../../services/ollama.service', () => ({}));
jest.mock('../../utils/image-preprocessor.util', () => ({ preprocessForOcr: jest.fn() }));
jest.mock('../../intake/cpu-extraction', () => ({ extractCpuDocument: jest.fn() }));

function makeResult(overrides: Partial<DocumentIntakeResult> = {}): DocumentIntakeResult {
  return {
    documentType: 'BILL' as IntakeDocumentType,
    classificationConfidence: 0.9,
    ocrConfidence: 0.9,
    extractedFields: {
      documentNumber: 'INV-1',
      date: '2024-01-01',
      dueDate: '2024-02-01',
      total: '100.0000',
      subtotal: '90.0000',
      tax: '10.0000',
      discount: null,
      vendorName: 'Test Vendor',
      vendorTaxId: '123456789',
      currency: 'USD',
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      paymentTerms: null,
      notes: null,
      customerName: null,
      lineItems: [],
    },
    fieldConfidence: {},
    fieldEvidence: {},
    extractionWarnings: [],
    matchedVendor: null,
    vendorCandidates: [],
    matchedCustomer: null,
    customerCandidates: [],
    duplicateWarning: null,
    rawText: 'test',
    accountingEntry: null,
    suggestCreateVendor: null,
    extractionMethod: 'rules',
    ...overrides,
  };
}

const fields: FieldValues = {
  invoiceNumber: null,
  date: null,
  dueDate: null,
  vendorTaxId: null,
  currency: null,
  subtotal: null,
  tax: null,
  total: '1.2345',
};

describe('benchmark runner', () => {
  const originalArgv = process.argv;
  const originalDir = process.env.INTAKE_TESSDATA_DIR;
  let directory: string;
  beforeEach(() => {
    jest.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), 'mizano-benchmark-'));
    process.argv = ['node', 'benchmark', '--corpus', directory];
    delete process.env.INTAKE_TESSDATA_DIR;
  });
  afterEach(() => {
    process.argv = originalArgv;
    if (originalDir === undefined) delete process.env.INTAKE_TESSDATA_DIR;
    else process.env.INTAKE_TESSDATA_DIR = originalDir;
    rmSync(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  function labels(documents: unknown): void {
    writeFileSync(join(directory, 'labels.json'), JSON.stringify({ synthetic: true, documents }));
  }
  it('rejects malformed labels before reading corpus files or extracting', async () => {
    labels({ 'missing.txt': { total: '1' } });
    const extract = jest.mocked(extractCpuDocument);
    await expect(main()).rejects.toThrow('Invalid benchmark label field');
    expect(extract).not.toHaveBeenCalled();
  });
  it('preflights the entire image corpus before extracting even an earlier text file', async () => {
    labels({ 'missing.txt': fields, 'missing.png': fields });
    const extract = jest.mocked(extractCpuDocument);
    await expect(main()).rejects.toThrow('Local OCR assets required');
    expect(extract).not.toHaveBeenCalled();
  });
  it('fails clearly when one requested local language asset is missing', async () => {
    process.env.INTAKE_TESSDATA_DIR = directory;
    writeFileSync(join(directory, 'eng.traineddata'), 'asset');
    labels({ 'missing.jpg': fields });
    const extract = jest.mocked(extractCpuDocument);
    await expect(main()).rejects.toThrow('Required local OCR traineddata asset is unavailable');
    expect(extract).not.toHaveBeenCalled();
  });
  it('continues image benchmarking when all requested local assets are present', async () => {
    process.env.INTAKE_TESSDATA_DIR = directory;
    writeFileSync(join(directory, 'eng.traineddata'), 'asset');
    writeFileSync(join(directory, 'ara.traineddata'), 'asset');
    writeFileSync(join(directory, 'invoice.png'), 'image');
    labels({ 'invoice.png': fields });
    jest.mocked(extractCpuDocument).mockResolvedValue(makeResult());
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main();
    expect(extractCpuDocument).toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Documents: 1'));
  });
  it.each(['empty', 'directory'])(
    'rejects unusable %s language assets before extraction',
    async (kind) => {
      process.env.INTAKE_TESSDATA_DIR = directory;
      process.argv.push('--language', 'eng');
      const asset = join(directory, 'eng.traineddata');
      if (kind === 'empty') writeFileSync(asset, '');
      else mkdirSync(asset);
      labels({ 'missing.png': fields });
      const extract = jest.mocked(extractCpuDocument);
      await expect(main()).rejects.toThrow('Required local OCR traineddata asset is unavailable');
      expect(extract).not.toHaveBeenCalled();
    },
  );
  it('reports actionable asset metadata without sensitive paths', async () => {
    labels({ 'missing.png': fields });
    let failure: unknown;
    try {
      await main();
    } catch (error) {
      failure = error;
    }
    expect(benchmarkError(failure)).toBe(
      'Benchmark failed: LocalOcrAssetsError(OCR_ASSETS_UNCONFIGURED)\n',
    );
    expect(benchmarkError(failure)).not.toContain(directory);
  });
  it('runs native text without OCR assets and preserves original precision into scoring', async () => {
    labels({ 'invoice.txt': fields });
    writeFileSync(join(directory, 'invoice.txt'), 'Total: 1.23');
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main();
    expect(output).toHaveBeenCalledWith(expect.stringContaining('| total | 0.0% | 0.0% | 0.0% |'));
    expect(output).toHaveBeenCalledWith(expect.not.stringContaining('1.23454'));
  });
  it('does not round numeric fallback predictions and prefers exact Decimal strings', async () => {
    const rules = invoiceRules.extractInvoiceFields('Total: 1.23', 0.95);
    jest.spyOn(invoiceRules, 'extractInvoiceFields').mockReturnValue({
      ...rules,
      total: {
        value: new Decimal('1.23454'),
        confidence: 0.9,
        evidence: { text: 'fixture', lineIndex: 0 },
      },
    });
    const result = await new RulesStrategy().extract({
      fileBuffer: Buffer.alloc(0),
      mimeType: 'application/pdf',
      language: 'eng',
      isPdf: true,
      pdfText: 'Total: 1.23454',
      pdfIsNativeText: true,
    });
    expect(result).not.toBeNull();
    const prediction = toFieldValues(result!.extraction, result!.exactMoney);
    expect(prediction.total).toBe('1.2345');
    expect(compareFields(prediction, fields).total).toBe(true);
    expect(toFieldValues({ ...result!.extraction, total: 1.23454 }).total).toBe('1.23454');
    labels({ 'invoice.txt': fields });
    writeFileSync(join(directory, 'invoice.txt'), 'Total: 1.23454');
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main();
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining('| total | 100.0% | 100.0% | 100.0% |'),
    );
  });
  it.each([
    new Error('private invoice /secret/path'),
    new SyntaxError('document text'),
    'document text',
  ])('formats failure without error values %#', (error) => {
    const output = benchmarkError(error);
    expect(output).not.toContain('private');
    expect(output).not.toContain('/secret/path');
    expect(output).not.toContain('document text');
    expect(output).toMatch(/^Benchmark failed: (Error|SyntaxError|Non-Error thrown \(string\))\n$/);
  });

  it('rejects --out when it is missing a path or consumes the next flag', async () => {
    process.argv = ['node', 'benchmark', '--corpus', directory, '--out', '--labels'];
    await expect(main()).rejects.toThrow('--out requires a directory path');
  });

  it('benchmarks scanned PDFs through extractCpuDocument instead of rejecting them', async () => {
    labels({ 'scanned.pdf': fields });
    writeFileSync(join(directory, 'scanned.pdf'), 'binary');
    jest.mocked(extractCpuDocument).mockResolvedValue(makeResult());
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main();
    expect(extractCpuDocument).toHaveBeenCalledWith(
      Buffer.from('binary'),
      'application/pdf',
      expect.any(String),
    );
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Documents: 1'));
  });
});
