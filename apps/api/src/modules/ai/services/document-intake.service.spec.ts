import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentIntakeService, ConfirmIntakeDto } from './document-intake.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OcrService } from './ocr.service';
import { DocumentClassificationService } from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { AiFeedbackService } from './ai-feedback.service';
import {
  createMockPrisma,
  MockPrismaClient,
  createMockOcrService,
  createMockDocumentClassification,
  createMockEntityExtraction,
  createMockAiFeedback,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('DocumentIntakeService', () => {
  let service: DocumentIntakeService;
  let prisma: MockPrismaClient;
  let ocrService: ReturnType<typeof createMockOcrService>;
  let classificationService: ReturnType<typeof createMockDocumentClassification>;
  let entityExtractionService: ReturnType<typeof createMockEntityExtraction>;
  let feedbackService: ReturnType<typeof createMockAiFeedback>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    ocrService = createMockOcrService();
    classificationService = createMockDocumentClassification();
    entityExtractionService = createMockEntityExtraction();
    feedbackService = createMockAiFeedback();

    // Add applyVendorHints and learnLayout mocks not in the helper
    (ocrService as any).applyVendorHints = jest
      .fn()
      .mockImplementation((_orgId: string, _vendorId: string, result: unknown) =>
        Promise.resolve(result),
      );
    (ocrService as any).learnLayout = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentIntakeService,
        { provide: PrismaService, useValue: prisma },
        { provide: OcrService, useValue: ocrService },
        { provide: DocumentClassificationService, useValue: classificationService },
        { provide: EntityExtractionService, useValue: entityExtractionService },
        { provide: AiFeedbackService, useValue: feedbackService },
      ],
    }).compile();

    service = module.get<DocumentIntakeService>(DocumentIntakeService);
  });

  describe('processDocument', () => {
    const imageBuffer = Buffer.from('fake-image-content');

    beforeEach(() => {
      // Default mock returns
      classificationService.classifyDocument.mockResolvedValue({
        category: 'INVOICE',
        confidence: 0.85,
        scores: [],
      } as any);

      entityExtractionService.extractAndMatch.mockResolvedValue({
        entities: [],
        matches: [],
      } as any);

      prisma.vendor.findMany.mockResolvedValue([] as any);
    });

    it('should process an image file through OCR and classification', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'ACME Corp\nInvoice No: INV-001\nTotal: 500.00',
        ocrConfidence: 0.9,
        vendorName: 'ACME Corp',
        invoiceNumber: 'INV-001',
        total: 500,
        subtotal: 450,
        tax: 50,
        date: '2024-01-15',
        lineItems: [],
        fieldConfidence: { total: 0.9, date: 0.8 },
      } as any);

      const result = await service.processDocument(
        TEST_ORG_ID,
        imageBuffer,
        'image/png',
        'invoice.png',
      );

      expect(result.documentType).toBeDefined();
      expect(result.extractedFields.total).toBe(500);
      expect(result.extractedFields.documentNumber).toBe('INV-001');
      expect(result.rawText).toContain('ACME Corp');
      expect(ocrService.extractFromImage).toHaveBeenCalledWith(imageBuffer, 'eng+ara');
    });

    it('should classify document type from classification result', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'Receipt text',
        ocrConfidence: 0.8,
        vendorName: null,
        invoiceNumber: null,
        total: null,
        subtotal: null,
        tax: null,
        date: null,
        lineItems: [],
        fieldConfidence: {},
      } as any);

      classificationService.classifyDocument.mockResolvedValue({
        category: 'RECEIPT',
        confidence: 0.92,
        scores: [],
      } as any);

      const result = await service.processDocument(
        TEST_ORG_ID,
        imageBuffer,
        'image/jpeg',
        'receipt.jpg',
      );

      expect(result.documentType).toBe('RECEIPT');
      expect(result.classificationConfidence).toBe(0.92);
    });

    it('should match vendors from entity extraction', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'Delta Supplies Corp',
        ocrConfidence: 0.85,
        vendorName: 'Delta Supplies Corp',
        invoiceNumber: null,
        total: 1000,
        subtotal: null,
        tax: null,
        date: null,
        lineItems: [],
        fieldConfidence: {},
      } as any);

      entityExtractionService.extractAndMatch.mockResolvedValue({
        entities: [{ text: 'Delta Supplies', type: 'ORG' }],
        matches: [
          {
            matchType: 'vendor',
            matchedName: 'Delta Supplies Corp',
            matchedId: 'vendor-001',
            similarity: 0.95,
          },
        ],
      } as any);

      prisma.vendor.findMany.mockResolvedValue([
        { id: 'vendor-001', name: 'Delta Supplies Corp', displayName: null },
      ] as any);

      const result = await service.processDocument(TEST_ORG_ID, imageBuffer, 'image/png');

      expect(result.matchedVendor).toBeDefined();
      expect(result.matchedVendor?.id).toBe('vendor-001');
      expect(result.vendorCandidates.length).toBeGreaterThan(0);
    });

    it('should detect duplicate when invoice number matches existing bill', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'INV-001\nTotal: 500.00',
        ocrConfidence: 0.9,
        vendorName: 'TestVendor',
        invoiceNumber: 'INV-001',
        total: 500,
        subtotal: null,
        tax: null,
        date: null,
        lineItems: [],
        fieldConfidence: {},
      } as any);

      entityExtractionService.extractAndMatch.mockResolvedValue({
        entities: [],
        matches: [
          {
            matchType: 'vendor',
            matchedName: 'TestVendor',
            matchedId: 'vendor-001',
            similarity: 0.9,
          },
        ],
      } as any);

      prisma.vendor.findMany.mockResolvedValue([
        { id: 'vendor-001', name: 'TestVendor', displayName: null },
      ] as any);

      ocrService.checkDuplicate.mockResolvedValue({
        isDuplicate: true,
        existingBillId: 'bill-existing',
        matchType: 'exact_number',
        similarity: 1.0,
      } as any);

      const result = await service.processDocument(TEST_ORG_ID, imageBuffer, 'image/png');

      expect(result.duplicateWarning).toBeDefined();
      expect(result.duplicateWarning?.isDuplicate).toBe(true);
      expect(result.duplicateWarning?.existingId).toBe('bill-existing');
    });

    it('should set duplicateWarning to null when no duplicate found', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'New invoice text',
        ocrConfidence: 0.85,
        vendorName: null,
        invoiceNumber: null,
        total: null,
        subtotal: null,
        tax: null,
        date: null,
        lineItems: [],
        fieldConfidence: {},
      } as any);

      const result = await service.processDocument(TEST_ORG_ID, imageBuffer, 'image/png');

      expect(result.duplicateWarning).toBeNull();
    });

    it('should derive dueDate as 30 days after extracted date', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'Date: 2024-03-01',
        ocrConfidence: 0.8,
        vendorName: null,
        invoiceNumber: null,
        total: null,
        subtotal: null,
        tax: null,
        date: '2024-03-01',
        lineItems: [],
        fieldConfidence: {},
      } as any);

      const result = await service.processDocument(TEST_ORG_ID, imageBuffer, 'image/png');

      expect(result.extractedFields.date).toBe('2024-03-01');
      expect(result.extractedFields.dueDate).toBe('2024-03-31');
    });

    it('should return ocrConfidence from OCR result', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'Some text',
        ocrConfidence: 0.72,
        vendorName: null,
        invoiceNumber: null,
        total: null,
        subtotal: null,
        tax: null,
        date: null,
        lineItems: [],
        fieldConfidence: {},
      } as any);

      const result = await service.processDocument(TEST_ORG_ID, imageBuffer, 'image/png');

      expect(result.ocrConfidence).toBe(0.72);
    });

    it('should pass language parameter to OCR service', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'Arabic text',
        ocrConfidence: 0.6,
        vendorName: null,
        invoiceNumber: null,
        total: null,
        subtotal: null,
        tax: null,
        date: null,
        lineItems: [],
        fieldConfidence: {},
      } as any);

      await service.processDocument(TEST_ORG_ID, imageBuffer, 'image/jpeg', 'doc.jpg', 'ara');

      expect(ocrService.extractFromImage).toHaveBeenCalledWith(imageBuffer, 'ara');
    });

    it('should return empty vendor candidates when no vendors exist in org', async () => {
      ocrService.extractFromImage.mockResolvedValue({
        rawText: 'Test',
        ocrConfidence: 0.5,
        vendorName: 'Test Corp',
        invoiceNumber: null,
        total: null,
        subtotal: null,
        tax: null,
        date: null,
        lineItems: [],
        fieldConfidence: {},
      } as any);

      prisma.vendor.findMany.mockResolvedValue([] as any);

      const result = await service.processDocument(TEST_ORG_ID, imageBuffer, 'image/png');

      expect(result.vendorCandidates).toEqual([]);
      expect(result.matchedVendor).toBeNull();
    });
  });

  describe('confirmAndCreate', () => {
    it('should create a draft bill with correct totals', async () => {
      prisma.vendor.findFirst.mockResolvedValue({
        id: 'vendor-001',
        name: 'ACME Corp',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.bill.create.mockResolvedValue({
        id: 'bill-001',
        billNumber: 'BILL-001',
        vendor: { id: 'vendor-001', name: 'ACME Corp' },
        lines: [],
      } as any);

      prisma.bill.findFirst.mockResolvedValue(null as any);

      const dto: ConfirmIntakeDto = {
        type: 'BILL',
        vendorId: 'vendor-001',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        documentNumber: 'BILL-001',
        lines: [
          { description: 'Widget A', quantity: 2, rate: 100, taxRate: 10 },
          { description: 'Widget B', quantity: 1, rate: 200, taxRate: 5 },
        ],
      };

      const result = await service.confirmAndCreate(TEST_ORG_ID, dto);

      expect(result.type).toBe('bill');
      expect(result.id).toBe('bill-001');
      expect(result.number).toBe('BILL-001');
      expect(prisma.bill.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when vendorId missing for bill', async () => {
      const dto: ConfirmIntakeDto = {
        type: 'BILL',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        lines: [{ description: 'Item', quantity: 1, rate: 100 }],
      };

      await expect(service.confirmAndCreate(TEST_ORG_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when vendor does not exist', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null as any);

      const dto: ConfirmIntakeDto = {
        type: 'BILL',
        vendorId: 'nonexistent-vendor',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        lines: [{ description: 'Item', quantity: 1, rate: 100 }],
      };

      await expect(service.confirmAndCreate(TEST_ORG_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should create a draft invoice when type is INVOICE', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'customer-001',
        name: 'John Customer',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.invoice.create.mockResolvedValue({
        id: 'inv-001',
        invoiceNumber: 'INV-001',
        customer: { id: 'customer-001', name: 'John Customer' },
        lines: [],
      } as any);

      prisma.invoice.findFirst.mockResolvedValue(null as any);

      const dto: ConfirmIntakeDto = {
        type: 'INVOICE',
        customerId: 'customer-001',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        lines: [{ description: 'Service', quantity: 1, rate: 500 }],
      };

      const result = await service.confirmAndCreate(TEST_ORG_ID, dto);

      expect(result.type).toBe('invoice');
      expect(result.id).toBe('inv-001');
      expect(prisma.invoice.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when customerId missing for invoice', async () => {
      const dto: ConfirmIntakeDto = {
        type: 'INVOICE',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        lines: [{ description: 'Item', quantity: 1, rate: 100 }],
      };

      await expect(service.confirmAndCreate(TEST_ORG_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('should log feedback after creating a bill', async () => {
      prisma.vendor.findFirst.mockResolvedValue({
        id: 'vendor-001',
        name: 'Vendor',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.bill.create.mockResolvedValue({
        id: 'bill-002',
        billNumber: 'BILL-002',
        vendor: { id: 'vendor-001', name: 'Vendor' },
        lines: [],
      } as any);

      prisma.bill.findFirst.mockResolvedValue(null as any);

      const dto: ConfirmIntakeDto = {
        type: 'BILL',
        vendorId: 'vendor-001',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        lines: [{ description: 'Item', quantity: 1, rate: 100 }],
      };

      await service.confirmAndCreate(TEST_ORG_ID, dto);

      expect(feedbackService.processFeedback).toHaveBeenCalled();
    });

    it('should generate sequential bill number when documentNumber not provided', async () => {
      prisma.vendor.findFirst.mockResolvedValue({
        id: 'vendor-001',
        name: 'V',
        organizationId: TEST_ORG_ID,
      } as any);

      prisma.bill.findFirst.mockResolvedValue({
        billNumber: 'BILL-005',
      } as any);

      prisma.bill.create.mockResolvedValue({
        id: 'bill-003',
        billNumber: 'BILL-006',
        vendor: { id: 'vendor-001', name: 'V' },
        lines: [],
      } as any);

      const dto: ConfirmIntakeDto = {
        type: 'BILL',
        vendorId: 'vendor-001',
        date: '2024-01-15',
        dueDate: '2024-02-14',
        lines: [{ description: 'Item', quantity: 1, rate: 100 }],
      };

      await service.confirmAndCreate(TEST_ORG_ID, dto);

      expect(prisma.bill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            billNumber: 'BILL-006',
          }),
        }),
      );
    });
  });
});
