import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiFeedbackAction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { OcrService, ExtractedInvoiceData } from './ocr.service';
import {
  DocumentClassificationService,
  DocumentCategory,
} from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { AiFeedbackService } from './ai-feedback.service';
import { extractTextFromPdf } from '../utils/pdf-extractor.util';
import {
  findBestMatch,
  levenshteinSimilarity,
  normalizeText,
} from '../utils/text-similarity.util';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type IntakeDocumentType = 'BILL' | 'INVOICE' | 'RECEIPT' | 'OTHER';

export interface VendorCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface CustomerCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface IntakeLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface DocumentIntakeResult {
  /** Classification */
  documentType: IntakeDocumentType;
  classificationConfidence: number;

  /** OCR-extracted fields */
  extractedFields: {
    date: string | null;
    dueDate: string | null;
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    documentNumber: string | null;
    vendorName: string | null;
    customerName: string | null;
    lineItems: IntakeLineItem[];
  };

  /** Per-field confidence (0-1) */
  fieldConfidence: Record<string, number>;
  ocrConfidence: number;

  /** Vendor matching */
  matchedVendor: VendorCandidate | null;
  vendorCandidates: VendorCandidate[];

  /** Customer matching */
  matchedCustomer: CustomerCandidate | null;
  customerCandidates: CustomerCandidate[];

  /** Duplicate detection */
  duplicateWarning: {
    isDuplicate: boolean;
    existingId: string | null;
    matchType: string;
    similarity: number;
  } | null;

  /** Raw OCR text */
  rawText: string;
}

export interface ConfirmIntakeLineDto {
  itemId?: string;
  accountId?: string;
  description: string;
  quantity: number;
  rate: number;
  taxRate?: number;
}

export interface ConfirmIntakeDto {
  type: 'BILL' | 'INVOICE';
  vendorId?: string;
  customerId?: string;
  date: string;
  dueDate: string;
  documentNumber?: string;
  lines: ConfirmIntakeLineDto[];
  notes?: string;
  projectId?: string;
  /** User corrections for vendor layout learning */
  corrections?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DocumentIntakeService {
  private readonly logger = new Logger(DocumentIntakeService.name);

  constructor(
    private prisma: PrismaService,
    private ocrService: OcrService,
    private classificationService: DocumentClassificationService,
    private entityExtractionService: EntityExtractionService,
    private feedbackService: AiFeedbackService,
  ) {}

  /**
   * Process a document through the full AI intake pipeline.
   *
   * Pipeline:
   *  1. Extract text (pdf-parse for native PDFs, tesseract.js for images/scanned PDFs)
   *  2. Classify document type (INVOICE, RECEIPT, PURCHASE_ORDER, etc.)
   *  3. Extract structured fields (date, total, tax, lineItems, etc.)
   *  4. Match vendor/customer against existing records
   *  5. Check for duplicates
   */
  async processDocument(
    organizationId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename?: string,
    language: string = 'eng+ara',
  ): Promise<DocumentIntakeResult> {
    this.logger.log(
      `Processing document intake: mime=${mimeType}, size=${fileBuffer.length}, file=${filename || 'unknown'}`,
    );

    // Step 1: Extract text based on file type
    let rawText = '';
    let ocrResult: ExtractedInvoiceData | null = null;
    const isPdf = mimeType === 'application/pdf';

    if (isPdf) {
      // Try native PDF text extraction first
      try {
        const pdfResult = await extractTextFromPdf(fileBuffer);
        this.logger.log(
          `PDF extraction: pages=${pdfResult.pageCount}, native=${pdfResult.isNativeText}, textLen=${pdfResult.text.length}`,
        );

        if (pdfResult.isNativeText) {
          rawText = pdfResult.text;
          // Still run OCR pattern extraction on the text for structured field parsing
          ocrResult = this.parseFieldsFromText(rawText);
        } else {
          // Scanned PDF — fall through to OCR
          ocrResult = await this.ocrService.extractFromImage(
            fileBuffer,
            language,
          );
          rawText = ocrResult.rawText;
        }
      } catch (error) {
        this.logger.warn(`PDF parsing failed, falling back to OCR: ${error}`);
        ocrResult = await this.ocrService.extractFromImage(
          fileBuffer,
          language,
        );
        rawText = ocrResult.rawText;
      }
    } else {
      // Image file — use tesseract.js OCR
      ocrResult = await this.ocrService.extractFromImage(fileBuffer, language);
      rawText = ocrResult.rawText;
    }

    // Step 2: Classify document
    const classification = await this.classificationService.classifyDocument(
      organizationId,
      rawText,
      filename,
    );
    const documentType = this.mapClassificationToType(classification.category);

    this.logger.log(
      `Classification: ${classification.category} (${(classification.confidence * 100).toFixed(1)}%) → ${documentType}`,
    );

    // Step 3: Extract entities and match against vendors/customers
    const entityResult = await this.entityExtractionService.extractAndMatch(
      organizationId,
      rawText,
    );

    // Step 4: Build vendor/customer candidate lists
    const { vendorCandidates, matchedVendor } =
      await this.matchVendors(
        organizationId,
        ocrResult?.vendorName || null,
        entityResult.matches,
      );

    const { customerCandidates, matchedCustomer } =
      await this.matchCustomers(
        organizationId,
        entityResult.matches,
      );

    // Step 5: Duplicate check
    let duplicateWarning: DocumentIntakeResult['duplicateWarning'] = null;
    if (matchedVendor && (ocrResult?.invoiceNumber || ocrResult?.total)) {
      const dupResult = await this.ocrService.checkDuplicate(
        organizationId,
        matchedVendor.id,
        ocrResult?.invoiceNumber || null,
        ocrResult?.total || null,
      );

      if (dupResult.isDuplicate) {
        duplicateWarning = {
          isDuplicate: true,
          existingId: dupResult.existingBillId,
          matchType: dupResult.matchType,
          similarity: dupResult.similarity,
        };
      }
    }

    // Step 6: Derive dueDate if possible (30 days from date by default)
    let dueDate: string | null = null;
    if (ocrResult?.date) {
      try {
        const dateObj = new Date(ocrResult.date);
        if (!isNaN(dateObj.getTime())) {
          dateObj.setDate(dateObj.getDate() + 30);
          dueDate = dateObj.toISOString().split('T')[0];
        }
      } catch {
        // Ignore date parse errors
      }
    }

    // Step 7: Extract customer name from entities for invoice-side
    const customerNameFromEntities =
      entityResult.matches
        .filter((m) => m.matchType === 'customer')
        .sort((a, b) => b.similarity - a.similarity)[0]?.matchedName || null;

    return {
      documentType,
      classificationConfidence: classification.confidence,
      extractedFields: {
        date: ocrResult?.date || null,
        dueDate,
        total: ocrResult?.total || null,
        subtotal: ocrResult?.subtotal || null,
        tax: ocrResult?.tax || null,
        documentNumber: ocrResult?.invoiceNumber || null,
        vendorName: ocrResult?.vendorName || null,
        customerName: customerNameFromEntities,
        lineItems: ocrResult?.lineItems || [],
      },
      fieldConfidence: ocrResult?.fieldConfidence || {},
      ocrConfidence: ocrResult?.ocrConfidence || 0,
      matchedVendor,
      vendorCandidates,
      matchedCustomer,
      customerCandidates,
      duplicateWarning,
      rawText,
    };
  }

  /**
   * Confirm extracted data and create a draft Bill or Invoice.
   * Also feeds corrections back for vendor layout learning.
   */
  async confirmAndCreate(
    organizationId: string,
    dto: ConfirmIntakeDto,
  ): Promise<{ type: 'bill' | 'invoice'; id: string; number: string }> {
    if (dto.type === 'BILL') {
      return this.createDraftBill(organizationId, dto);
    } else {
      return this.createDraftInvoice(organizationId, dto);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Create a draft Bill from confirmed intake data.
   */
  private async createDraftBill(
    organizationId: string,
    dto: ConfirmIntakeDto,
  ): Promise<{ type: 'bill'; id: string; number: string }> {
    if (!dto.vendorId) {
      throw new BadRequestException('Vendor is required to create a bill');
    }

    // Verify vendor
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, organizationId, deletedAt: null },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    // Generate bill number
    const billNumber = dto.documentNumber || (await this.generateBillNumber(organizationId));

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    const lines = dto.lines.map((line) => {
      const qty = line.quantity;
      const rate = line.rate;
      const tax = line.taxRate || 0;
      const lineTotal = qty * rate;
      subtotal += lineTotal;
      taxAmount += lineTotal * (tax / 100);
      return { ...line, amount: lineTotal };
    });

    const grandTotal = subtotal + taxAmount;

    const bill = await this.prisma.bill.create({
      data: {
        billNumber,
        vendorId: dto.vendorId,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        grandTotal: new Decimal(grandTotal),
        balanceDue: new Decimal(grandTotal),
        notes: dto.notes || 'Created from document scan',
        projectId: dto.projectId,
        organizationId,
        lines: {
          create: lines.map((line) => ({
            itemId: line.itemId || null,
            accountId: line.accountId || null,
            description: line.description,
            quantity: new Decimal(line.quantity),
            rate: new Decimal(line.rate),
            taxRate: new Decimal(line.taxRate || 0),
            amount: new Decimal(line.amount),
          })),
        },
      },
      include: { vendor: { select: { id: true, name: true } }, lines: true },
    });

    // Learn vendor layout if corrections were provided
    if (dto.corrections && dto.vendorId && Object.keys(dto.corrections).length > 0) {
      try {
        await this.ocrService.learnLayout(
          organizationId,
          dto.vendorId,
          dto.corrections,
        );
      } catch (error) {
        this.logger.warn(`Failed to learn vendor layout: ${error}`);
      }
    }

    // Log feedback for AI improvement
    try {
      await this.feedbackService.processFeedback(organizationId, {
        feature: AiFeature.OCR_LAYOUT,
        aiSuggestion: { type: 'document_intake', documentType: 'BILL' },
        userAction: dto.corrections
          ? AiFeedbackAction.CORRECTED
          : AiFeedbackAction.ACCEPTED,
        userAnswer: dto.corrections
          ? JSON.stringify(dto.corrections)
          : undefined,
        inputData: { billNumber, vendorId: dto.vendorId },
      });
    } catch (error) {
      this.logger.warn(`Failed to log feedback: ${error}`);
    }

    this.logger.log(
      `Created draft bill ${billNumber} from document intake for org ${organizationId}`,
    );

    return { type: 'bill', id: bill.id, number: billNumber };
  }

  /**
   * Create a draft Invoice from confirmed intake data.
   */
  private async createDraftInvoice(
    organizationId: string,
    dto: ConfirmIntakeDto,
  ): Promise<{ type: 'invoice'; id: string; number: string }> {
    if (!dto.customerId) {
      throw new BadRequestException(
        'Customer is required to create an invoice',
      );
    }

    // Verify customer
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(organizationId);

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    const lines = dto.lines.map((line) => {
      const qty = line.quantity;
      const rate = line.rate;
      const tax = line.taxRate || 0;
      const lineTotal = qty * rate;
      subtotal += lineTotal;
      taxAmount += lineTotal * (tax / 100);
      return { ...line, amount: lineTotal };
    });

    const grandTotal = subtotal + taxAmount;

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: dto.customerId,
        projectId: dto.projectId,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        shippingAmount: new Decimal(0),
        grandTotal: new Decimal(grandTotal),
        balanceDue: new Decimal(grandTotal),
        notes: dto.notes || 'Created from document scan',
        organizationId,
        lines: {
          create: lines.map((line) => ({
            itemId: line.itemId || null,
            accountId: line.accountId || null,
            description: line.description,
            quantity: new Decimal(line.quantity),
            rate: new Decimal(line.rate),
            discount: new Decimal(0),
            taxRate: new Decimal(line.taxRate || 0),
            amount: new Decimal(line.amount),
          })),
        },
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines: true,
      },
    });

    this.logger.log(
      `Created draft invoice ${invoiceNumber} from document intake for org ${organizationId}`,
    );

    return { type: 'invoice', id: invoice.id, number: invoiceNumber };
  }

  /**
   * Map document classification category to intake document type.
   */
  private mapClassificationToType(
    category: DocumentCategory,
  ): IntakeDocumentType {
    switch (category) {
      case DocumentCategory.INVOICE:
        // Default to BILL since most uploaded invoices are vendor invoices
        return 'BILL';
      case DocumentCategory.RECEIPT:
        return 'RECEIPT';
      case DocumentCategory.PURCHASE_ORDER:
        return 'BILL';
      default:
        return 'OTHER';
    }
  }

  /**
   * Match vendor name from OCR + entity extraction against existing vendors.
   * Returns ranked candidate list.
   */
  private async matchVendors(
    organizationId: string,
    ocrVendorName: string | null,
    entityMatches: Array<{
      matchType: string;
      matchedName: string;
      matchedId: string;
      similarity: number;
    }>,
  ): Promise<{
    vendorCandidates: VendorCandidate[];
    matchedVendor: VendorCandidate | null;
  }> {
    // Get all vendors for this org
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, displayName: true },
    });

    if (vendors.length === 0) {
      return { vendorCandidates: [], matchedVendor: null };
    }

    const candidateMap = new Map<string, VendorCandidate>();

    // Add entity extraction matches
    for (const match of entityMatches) {
      if (match.matchType === 'vendor') {
        candidateMap.set(match.matchedId, {
          id: match.matchedId,
          name: match.matchedName,
          similarity: match.similarity,
        });
      }
    }

    // Try direct fuzzy matching of OCR vendor name against vendor list
    if (ocrVendorName) {
      const vendorNames = vendors.map((v) => v.displayName || v.name);
      const topMatches = this.findTopMatches(
        ocrVendorName,
        vendorNames,
        vendors,
        5,
        0.4,
      );

      for (const match of topMatches) {
        const existing = candidateMap.get(match.id);
        if (!existing || match.similarity > existing.similarity) {
          candidateMap.set(match.id, match);
        }
      }
    }

    // Sort by similarity descending
    const vendorCandidates = [...candidateMap.values()].sort(
      (a, b) => b.similarity - a.similarity,
    );

    // Top candidate with > 0.6 similarity is the match
    const matchedVendor =
      vendorCandidates.length > 0 && vendorCandidates[0].similarity >= 0.6
        ? vendorCandidates[0]
        : null;

    return { vendorCandidates: vendorCandidates.slice(0, 5), matchedVendor };
  }

  /**
   * Match customer from entity extraction against existing customers.
   */
  private async matchCustomers(
    organizationId: string,
    entityMatches: Array<{
      matchType: string;
      matchedName: string;
      matchedId: string;
      similarity: number;
    }>,
  ): Promise<{
    customerCandidates: CustomerCandidate[];
    matchedCustomer: CustomerCandidate | null;
  }> {
    const customerMatches = entityMatches
      .filter((m) => m.matchType === 'customer')
      .map((m) => ({
        id: m.matchedId,
        name: m.matchedName,
        similarity: m.similarity,
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const matchedCustomer =
      customerMatches.length > 0 && customerMatches[0].similarity >= 0.6
        ? customerMatches[0]
        : null;

    return {
      customerCandidates: customerMatches.slice(0, 5),
      matchedCustomer,
    };
  }

  /**
   * Find top N fuzzy matches for a name against a list of candidates.
   */
  private findTopMatches(
    target: string,
    names: string[],
    records: Array<{ id: string; name: string; displayName?: string | null }>,
    topN: number,
    threshold: number,
  ): VendorCandidate[] {
    const normalizedTarget = normalizeText(target);
    const results: VendorCandidate[] = [];

    for (let i = 0; i < names.length; i++) {
      const similarity = levenshteinSimilarity(
        normalizedTarget,
        normalizeText(names[i]),
      );
      if (similarity >= threshold) {
        results.push({
          id: records[i].id,
          name: names[i],
          similarity: Math.round(similarity * 1000) / 1000,
        });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topN);
  }

  /**
   * Parse structured invoice fields from plain text (for native PDFs).
   * Reuses the same regex patterns as OcrService.
   */
  private parseFieldsFromText(text: string): ExtractedInvoiceData {
    const lines = text.split('\n').filter((l) => l.trim());
    const fieldConfidence: Record<string, number> = {};

    // Date patterns
    const datePatterns = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,
      /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
    ];

    let date: string | null = null;
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        date = match[0];
        fieldConfidence['date'] = 0.8;
        break;
      }
    }
    if (!date) fieldConfidence['date'] = 0;

    // Total
    const totalPatterns = [
      /(?:grand\s*)?total[\s:$€£¥]*([0-9,]+\.?\d*)/i,
      /amount\s*(?:due|payable)[\s:$€£¥]*([0-9,]+\.?\d*)/i,
      /balance\s*(?:due)?[\s:$€£¥]*([0-9,]+\.?\d*)/i,
    ];
    let total: number | null = null;
    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        total = parseFloat(match[1].replace(/,/g, '')) || null;
        fieldConfidence['total'] = 0.85;
        break;
      }
    }
    if (total === null) fieldConfidence['total'] = 0;

    // Subtotal
    let subtotal: number | null = null;
    const subtotalMatch = text.match(
      /sub.?total[\s:$€£¥]*([0-9,]+\.?\d*)/i,
    );
    if (subtotalMatch) {
      subtotal = parseFloat(subtotalMatch[1].replace(/,/g, '')) || null;
      fieldConfidence['subtotal'] = 0.75;
    } else {
      fieldConfidence['subtotal'] = 0;
    }

    // Tax
    let tax: number | null = null;
    const taxMatch = text.match(
      /(?:tax|vat|gst)[\s:$€£¥]*([0-9,]+\.?\d*)/i,
    );
    if (taxMatch) {
      tax = parseFloat(taxMatch[1].replace(/,/g, '')) || null;
      fieldConfidence['tax'] = 0.7;
    } else {
      fieldConfidence['tax'] = 0;
    }

    // Invoice number
    let invoiceNumber: string | null = null;
    const invoicePatterns = [
      /inv(?:oice)?[\s#:]*([A-Z0-9\-]+)/i,
      /bill[\s#:]*([A-Z0-9\-]+)/i,
      /ref(?:erence)?[\s#:]*([A-Z0-9\-]+)/i,
      /#\s*([A-Z0-9\-]{3,})/i,
    ];
    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length >= 3) {
        invoiceNumber = match[1].trim();
        fieldConfidence['invoiceNumber'] = 0.9;
        break;
      }
    }
    if (!invoiceNumber) fieldConfidence['invoiceNumber'] = 0;

    // Vendor name (first meaningful line)
    let vendorName: string | null = null;
    const headerLines = lines.slice(0, 5).filter((l) => {
      const trimmed = l.trim();
      if (/^\d+[\/\-\.]\d+[\/\-\.]\d+$/.test(trimmed)) return false;
      if (/^[\d\s,.$€£¥]+$/.test(trimmed)) return false;
      if (trimmed.length < 3) return false;
      return /[a-zA-Z\u0600-\u06FF]{2,}/.test(trimmed);
    });
    if (headerLines.length > 0) {
      vendorName = headerLines[0].trim();
      fieldConfidence['vendorName'] = 0.6;
    } else {
      fieldConfidence['vendorName'] = 0;
    }

    // Line items (simplified parsing)
    const lineItems: ExtractedInvoiceData['lineItems'] = [];
    const lineItemPattern =
      /(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i;
    const simplePattern =
      /(.+?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)/;

    for (const line of lines) {
      let match = line.match(lineItemPattern);
      if (match) {
        const qty = parseFloat(match[2]);
        const price = parseFloat(match[3].replace(/,/g, ''));
        lineItems.push({
          description: match[1].trim(),
          quantity: qty,
          unitPrice: price,
          total: qty * price,
        });
        continue;
      }
      match = line.match(simplePattern);
      if (match) {
        lineItems.push({
          description: match[1].trim(),
          quantity: parseFloat(match[2].replace(/,/g, '')),
          unitPrice: parseFloat(match[3].replace(/,/g, '')),
          total: parseFloat(match[4].replace(/,/g, '')),
        });
      }
    }
    fieldConfidence['lineItems'] = lineItems.length > 0 ? 0.65 : 0;

    return {
      date,
      total,
      subtotal,
      tax,
      invoiceNumber,
      vendorName,
      lineItems,
      ocrConfidence: 0.85, // Native PDF text is higher confidence than OCR
      rawText: text,
      fieldConfidence,
    };
  }

  /**
   * Generate a sequential bill number.
   */
  private async generateBillNumber(organizationId: string): Promise<string> {
    const lastBill = await this.prisma.bill.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { billNumber: true },
    });

    if (!lastBill || !lastBill.billNumber) {
      return 'BILL-001';
    }

    const parts = lastBill.billNumber.split('-');
    const lastNumber = parseInt(parts[parts.length - 1], 10);
    if (isNaN(lastNumber)) {
      return 'BILL-001';
    }

    return `BILL-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  /**
   * Generate a sequential invoice number.
   */
  private async generateInvoiceNumber(
    organizationId: string,
  ): Promise<string> {
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    if (!lastInvoice || !lastInvoice.invoiceNumber) {
      return 'INV-001';
    }

    const parts = lastInvoice.invoiceNumber.split('-');
    const lastNumber = parseInt(parts[parts.length - 1], 10);
    if (isNaN(lastNumber)) {
      return 'INV-001';
    }

    return `INV-${String(lastNumber + 1).padStart(3, '0')}`;
  }
}
