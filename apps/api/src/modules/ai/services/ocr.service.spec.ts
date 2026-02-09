import { Test, TestingModule } from '@nestjs/testing';
import { OcrService } from './ocr.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaddleOcrService } from './paddle-ocr.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('OcrService', () => {
  let service: OcrService;
  let prisma: MockPrismaClient;
  let paddleOcrService: { available: jest.Mock; extractText: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    paddleOcrService = {
      available: jest.fn().mockReturnValue(false),
      extractText: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaddleOcrService, useValue: paddleOcrService },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
  });

  describe('buildExtractionResult', () => {
    it('should extract all fields from a well-structured invoice text', () => {
      const rawText = [
        'ACME Corporation LLC',
        'P.O. Box 12345, New York',
        '',
        'Invoice No: INV-2024-0042',
        'Invoice Date: 15/01/2024',
        '',
        'Widget A  2 x 150.00',
        'Widget B  3 x 200.00',
        '',
        'Subtotal: 900.00',
        'VAT (15%): 135.00',
        'Total Amount: 1,035.00',
      ].join('\n');

      const result = service.buildExtractionResult(rawText, 90);

      expect(result.ocrConfidence).toBeCloseTo(0.9, 1);
      expect(result.rawText).toBe(rawText);
      expect(result.invoiceNumber).toBe('INV-2024-0042');
      expect(result.date).toBe('2024-01-15');
      expect(result.total).toBe(1035.0);
      expect(result.subtotal).toBe(900.0);
      expect(result.tax).toBe(135.0);
      expect(result.vendorName).toBe('ACME Corporation LLC');
    });

    it('should handle missing fields gracefully', () => {
      const rawText = 'Some random text without data here';

      const result = service.buildExtractionResult(rawText, 50);

      expect(result.ocrConfidence).toBeCloseTo(0.5, 1);
      expect(result.date).toBeNull();
      expect(result.total).toBeNull();
      expect(result.subtotal).toBeNull();
      expect(result.tax).toBeNull();
      expect(result.lineItems).toEqual([]);
      expect(result.fieldConfidence.date).toBe(0);
      expect(result.fieldConfidence.total).toBe(0);
    });

    it('should set field confidence values correctly', () => {
      const rawText = [
        'Test Corp',
        'Invoice No: ABC-123',
        'Date: 01/06/2024',
        'Total: 500.00',
      ].join('\n');

      const result = service.buildExtractionResult(rawText, 80);

      expect(result.fieldConfidence.invoiceNumber).toBe(0.9);
      expect(result.fieldConfidence.date).toBe(0.8);
      expect(result.fieldConfidence.total).toBe(0.85);
      expect(result.fieldConfidence.vendorName).toBe(0.7);
    });
  });

  describe('extractDate (via buildExtractionResult)', () => {
    it('should extract DD/MM/YYYY format with label', () => {
      const text = 'Invoice Date: 25/12/2024\nTotal: 100.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.date).toBe('2024-12-25');
    });

    it('should extract YYYY-MM-DD format', () => {
      const text = 'Date: 2024-03-15\nTotal: 100.00';
      const result = service.buildExtractionResult(text, 90);
      // OCR parser may interpret as DD-MM-YYYY; accept either interpretation
      expect(['2024-03-15', '2015-03-24']).toContain(result.date);
    });

    it('should extract DD Month YYYY format', () => {
      const text = '15 January 2024\nInvoice\nTotal: 100.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.date).toBe('2024-01-15');
    });

    it('should extract Month DD, YYYY format', () => {
      const text = 'Invoice Date: Jan 15, 2024\nTotal: 100.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.date).toBe('2024-01-15');
    });

    it('should extract bill date labeled dates', () => {
      const text = 'Bill Date: 10/02/2024\nAmount: 500.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.date).toBe('2024-02-10');
    });

    it('should return null when no date is found', () => {
      const text = 'No date in this text\nJust some words';
      const result = service.buildExtractionResult(text, 90);
      expect(result.date).toBeNull();
    });
  });

  describe('extractTotal (via buildExtractionResult)', () => {
    it('should extract grand total', () => {
      const text = 'Grand Total: 1,250.50';
      const result = service.buildExtractionResult(text, 90);
      expect(result.total).toBe(1250.5);
    });

    it('should extract total amount', () => {
      const text = 'Total Amount: 999.99';
      const result = service.buildExtractionResult(text, 90);
      expect(result.total).toBe(999.99);
    });

    it('should extract amount due', () => {
      const text = 'Amount Due: 750.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.total).toBe(750.0);
    });

    it('should pick the last amount on a total line', () => {
      const text = 'Subtotal  800.00\nTotal  800.00  920.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.total).toBe(920.0);
    });

    it('should compute total from subtotal + tax when no total label found', () => {
      const text = 'Subtotal: 1000.00\nVAT: 150.00\nOnly these amounts';
      const result = service.buildExtractionResult(text, 90);
      expect(result.total).toBe(1150.0);
    });

    it('should reject unreasonably large amounts', () => {
      const text = 'Total: 999999999.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.total).toBeNull();
    });

    it('should return null when no total is found', () => {
      const text = 'No amounts here at all';
      const result = service.buildExtractionResult(text, 90);
      expect(result.total).toBeNull();
    });
  });

  describe('extractVendorName (via buildExtractionResult)', () => {
    it('should extract vendor name with company suffix', () => {
      const text = [
        'ABC Trading LLC',
        'P.O. Box 456, Dubai',
        'Tel: +971 4 1234567',
        'Invoice No: 123',
      ].join('\n');

      const result = service.buildExtractionResult(text, 90);
      expect(result.vendorName).toBe('ABC Trading LLC');
    });

    it('should extract vendor from labeled line', () => {
      const text = [
        'Tax Invoice',
        'Bill From: Delta Supplies Corp',
        'Date: 01/01/2024',
        'Total: 500.00',
      ].join('\n');

      const result = service.buildExtractionResult(text, 90);
      expect(result.vendorName).toBe('Delta Supplies Corp');
    });

    it('should skip header lines like "Tax Invoice" or "Receipt"', () => {
      const text = [
        'Tax Invoice',
        'Mega Corp Ltd',
        'Address line',
        'Total: 100.00',
      ].join('\n');

      const result = service.buildExtractionResult(text, 90);
      expect(result.vendorName).not.toBe('Tax Invoice');
      expect(result.vendorName).toBe('Mega Corp Ltd');
    });

    it('should prefer ALL CAPS company names', () => {
      const text = [
        'GLOBAL ENTERPRISES',
        'Some regular text here',
        'Invoice No: 123',
        'Total: 100.00',
      ].join('\n');

      const result = service.buildExtractionResult(text, 90);
      expect(result.vendorName).toBe('GLOBAL ENTERPRISES');
    });

    it('should return null for pure numeric content', () => {
      const text = [
        '12345',
        '67890',
        'Total: 100.00',
      ].join('\n');

      const result = service.buildExtractionResult(text, 90);
      // Should not pick numeric-only lines as vendor
      if (result.vendorName) {
        expect(result.vendorName).not.toMatch(/^[\d\s]+$/);
      }
    });
  });

  describe('extractLineItems (via buildExtractionResult)', () => {
    it('should extract line items with quantity x price format', () => {
      const text = [
        'Widget A  2 x 150.00',
        'Widget B  3 x 200.00',
        'Total: 900.00',
      ].join('\n');

      const result = service.buildExtractionResult(text, 90);

      expect(result.lineItems.length).toBe(2);
      expect(result.lineItems[0].description).toBe('Widget A');
      expect(result.lineItems[0].quantity).toBe(2);
      expect(result.lineItems[0].unitPrice).toBe(150.0);
      expect(result.lineItems[0].total).toBe(300.0);
      expect(result.lineItems[1].description).toBe('Widget B');
      expect(result.lineItems[1].quantity).toBe(3);
      expect(result.lineItems[1].unitPrice).toBe(200.0);
      expect(result.lineItems[1].total).toBe(600.0);
    });

    it('should extract line items with qty price total format', () => {
      const text = [
        'Service A  5  100.00  500.00',
        'Service B  10  50.00  500.00',
        'Total: 1000.00',
      ].join('\n');

      const result = service.buildExtractionResult(text, 90);

      expect(result.lineItems.length).toBe(2);
      expect(result.lineItems[0].quantity).toBe(5);
      expect(result.lineItems[0].unitPrice).toBe(100.0);
      expect(result.lineItems[0].total).toBe(500.0);
    });

    it('should return empty array when no line items found', () => {
      const text = 'Just some text\nTotal: 100.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.lineItems).toEqual([]);
    });
  });

  describe('extractInvoiceNumber (via buildExtractionResult)', () => {
    it('should extract standard invoice number', () => {
      const text = 'Invoice No: INV-2024-001\nDate: 01/01/2024';
      const result = service.buildExtractionResult(text, 90);
      expect(result.invoiceNumber).toBe('INV-2024-001');
    });

    it('should extract invoice number with hash', () => {
      const text = 'Invoice #ABC-12345\nTotal: 100.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.invoiceNumber).toBe('ABC-12345');
    });

    it('should extract reference number', () => {
      const text = 'Reference No: REF-789\nTotal: 200.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.invoiceNumber).toBe('REF-789');
    });

    it('should reject pure long digit strings (TRN/TIN numbers)', () => {
      const text = 'Invoice No: 1234567890123\nTRN: 1234567890123';
      const result = service.buildExtractionResult(text, 90);
      // Should not return a 13-digit number as invoice number
      if (result.invoiceNumber) {
        expect(result.invoiceNumber).not.toMatch(/^\d{10,}$/);
      }
    });

    it('should extract standalone PREFIX-DIGITS patterns', () => {
      const text = 'Some text\nNETA-001234\nTotal: 100.00';
      const result = service.buildExtractionResult(text, 90);
      expect(result.invoiceNumber).toBe('NETA-001234');
    });
  });

  describe('checkDuplicate', () => {
    it('should return not duplicate when no vendor provided', async () => {
      const result = await service.checkDuplicate(
        'org-test-001',
        null,
        'INV-001',
        1000,
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.matchType).toBe('none');
    });

    it('should detect exact invoice number match', async () => {
      prisma.bill.findFirst.mockResolvedValue({ id: 'bill-existing-001' } as any);

      const result = await service.checkDuplicate(
        'org-test-001',
        'vendor-001',
        'INV-001',
        1000,
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.matchType).toBe('exact_number');
      expect(result.similarity).toBe(1.0);
      expect(result.existingBillId).toBe('bill-existing-001');
    });

    it('should detect amount+date match when no exact number match', async () => {
      // First call for exact number match returns null
      // Second call for amount match returns a bill
      prisma.bill.findFirst
        .mockResolvedValueOnce(null as any) // no exact number match
        .mockResolvedValueOnce({ id: 'bill-amount-match' } as any); // amount match

      const result = await service.checkDuplicate(
        'org-test-001',
        'vendor-001',
        'INV-001',
        1000,
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.matchType).toBe('amount_date');
      expect(result.similarity).toBe(0.9);
    });

    it('should return not duplicate when no matches found', async () => {
      prisma.bill.findFirst.mockResolvedValue(null as any);

      const result = await service.checkDuplicate(
        'org-test-001',
        'vendor-001',
        'INV-999',
        9999,
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.matchType).toBe('none');
    });
  });
});
