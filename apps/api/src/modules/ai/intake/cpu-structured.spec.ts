import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RulesStrategy } from '../extraction/rules-strategy.service';
import {
  classifyDocumentText,
  cpuReviewResult,
  MIN_RULES_TEXT_LENGTH,
  NATIVE_TEXT_CONFIDENCE,
  structuredCpuResult,
} from './cpu-structured';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../extraction/rules/__fixtures__', name), 'utf8');

describe('structuredCpuResult: rules extraction over worker text', () => {
  it('turns English OCR text into structured fields with evidence', () => {
    const result = structuredCpuResult(fixture('en-eg-invoice.txt'), NATIVE_TEXT_CONFIDENCE);
    expect(result).toMatchObject({
      documentType: 'BILL',
      extractionMethod: 'rules',
      extractedFields: {
        documentNumber: 'INV-2024-0042',
        date: '2024-03-15',
        dueDate: '2024-04-14',
        subtotal: 1000,
        tax: 140,
        total: 1140,
        currency: 'EGP',
        vendorName: 'Cairo Office Supplies Co.',
        vendorTaxId: '123456789',
      },
    });
    expect(result.ocrConfidence).toBeGreaterThanOrEqual(0.6);
    expect(result.extractionWarnings).toEqual([]);
    expect(result.fieldEvidence?.total).toEqual({
      text: expect.stringContaining('1,140.00'),
      lineIndex: expect.any(Number),
    });
    expect(result.rawText).toContain('Cairo Office Supplies');
  });

  it('normalizes Arabic-Indic digits and labels (Egypt)', () => {
    const result = structuredCpuResult(fixture('ar-eg-invoice.txt'), NATIVE_TEXT_CONFIDENCE);
    expect(result.documentType).toBe('BILL');
    expect(result.extractedFields).toMatchObject({
      documentNumber: 'INV-2024-0150',
      date: '2024-03-15',
      dueDate: '2024-04-14',
      subtotal: 1000,
      tax: 140,
      total: 1140,
      currency: 'EGP',
      vendorName: 'شركة النيل للتوريدات',
    });
  });

  it.each([
    ['ar-sa-invoice.txt', 2300, 'SAR'],
    ['en-sa-invoice.txt', 2300, 'SAR'],
    ['en-ae-invoice.txt', 1260, 'AED'],
  ])('reads totals and currency from %s', (name, total, currency) => {
    const fields = structuredCpuResult(fixture(name), NATIVE_TEXT_CONFIDENCE).extractedFields;
    expect(fields.total).toBe(total);
    expect(fields.currency).toBe(currency);
  });

  it('leaves vendor and duplicate matching to the database step', () => {
    const result = structuredCpuResult(fixture('en-eg-invoice.txt'), NATIVE_TEXT_CONFIDENCE);
    expect(result).toMatchObject({
      matchedVendor: null,
      vendorCandidates: [],
      matchedCustomer: null,
      customerCandidates: [],
      duplicateWarning: null,
      suggestCreateVendor: null,
    });
  });

  it('keeps unknown values unknown and never invents a due date', () => {
    const result = structuredCpuResult(fixture('en-sa-invoice.txt'), NATIVE_TEXT_CONFIDENCE);
    expect(result.extractedFields.dueDate).toBeNull();
    expect(result.extractedFields.customerName).toBeNull();
    expect(result.extractedFields.lineItems).toEqual([]);
    const sparse = structuredCpuResult(fixture('en-no-totals.txt'), NATIVE_TEXT_CONFIDENCE);
    expect(sparse.extractedFields).toMatchObject({ total: null, date: null, currency: null });
    expect(sparse.documentType).toBe('OTHER');
    expect(sparse.ocrConfidence).toBe(0);
  });

  it('flags totals that do not add up and caps confidence below the review threshold', () => {
    const result = structuredCpuResult(fixture('en-mismatch.txt'), NATIVE_TEXT_CONFIDENCE);
    expect(result.extractionWarnings).toContain('TOTALS_MISMATCH');
    expect(result.ocrConfidence).toBeLessThan(0.6);
  });

  it('scales confidence down with a weak OCR page instead of trusting the values', () => {
    const text = fixture('en-eg-invoice.txt');
    const strong = structuredCpuResult(text, 0.95).ocrConfidence;
    const weak = structuredCpuResult(text, 0.2).ocrConfidence;
    expect(weak).toBeLessThan(strong);
    expect(weak).toBeLessThan(0.6);
  });

  it(`stays evidence-only below ${MIN_RULES_TEXT_LENGTH} characters of text`, () => {
    const result = structuredCpuResult('  ab \n ', 0.9);
    expect(result).toEqual(cpuReviewResult('  ab \n ', 0.9));
    expect(result).toMatchObject({
      documentType: 'OTHER',
      extractionMethod: 'cpu-ocr',
      ocrConfidence: 0.9,
      extractedFields: { total: null, date: null, vendorName: null },
    });
  });

  describe('parity with the API rules strategy', () => {
    beforeEach(() => {
      for (const method of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
        jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
      }
    });
    afterEach(() => jest.restoreAllMocks());

    it.each([
      'en-eg-invoice.txt',
      'ar-eg-invoice.txt',
      'ar-sa-invoice.txt',
      'en-sa-invoice.txt',
      'en-ae-invoice.txt',
      'en-mismatch.txt',
    ])('reads %s exactly as RulesStrategy does for the same PDF text', async (name) => {
      const text = fixture(name);
      const legacy = await new RulesStrategy().extract({
        fileBuffer: Buffer.alloc(0),
        mimeType: 'application/pdf',
        language: 'eng+ara',
        isPdf: true,
        pdfText: text,
        pdfIsNativeText: true,
      });
      const worker = structuredCpuResult(text, NATIVE_TEXT_CONFIDENCE);
      const expected = legacy?.extraction;
      expect(expected).toBeDefined();
      expect(worker.extractedFields).toMatchObject({
        date: expected?.date,
        dueDate: expected?.dueDate,
        total: expected?.total,
        subtotal: expected?.subtotal,
        tax: expected?.tax,
        documentNumber: expected?.invoiceNumber,
        vendorName: expected?.vendorName,
        vendorTaxId: expected?.vendorTaxId,
        currency: expected?.currency,
      });
      expect(worker.ocrConfidence).toBe(expected?.ocrConfidence);
      expect(worker.fieldConfidence).toEqual(expected?.fieldConfidence);
      expect(worker.fieldEvidence).toEqual(expected?.fieldEvidence);
      expect(worker.extractionWarnings).toEqual(expected?.extractionWarnings);
    });
  });
});

describe('classifyDocumentText (keywords, no model)', () => {
  it.each([
    ['Tax Invoice\nInvoice No: 5', 'BILL', 0.7],
    ['Tax\n   Invoice  total', 'BILL', 0.6],
    ['فاتورة ضريبية\nرقم الفاتورة: ١٢', 'BILL', 0.7],
    ['Invoice from Acme', 'BILL', 0.5],
    ['Sales receipt: thank you', 'RECEIPT', 0.5],
    ['إيصال استلام نقدية', 'RECEIPT', 0.5],
    ['Receipt for invoice paid', 'RECEIPT', 0.5],
    ['Meeting notes about the weather', 'OTHER', 0],
  ] as const)('%j is %s', (text, documentType, confidence) => {
    const result = classifyDocumentText(text);
    expect(result.documentType).toBe(documentType);
    expect(result.confidence).toBeCloseTo(confidence, 5);
  });

  it('caps the keyword confidence', () => {
    const text = [
      'tax invoice',
      'invoice no',
      'invoice number',
      'invoice date',
      'bill to',
      'total amount due',
      'فاتورة ضريبية',
      'رقم الفاتورة',
      'فاتورة رقم',
      'تاريخ الفاتورة',
    ].join('\n');
    expect(classifyDocumentText(text)).toEqual({ documentType: 'BILL', confidence: 0.95 });
  });
});
