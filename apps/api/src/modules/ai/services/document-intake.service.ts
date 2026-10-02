import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiFeedbackAction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { OllamaService, DocumentExtractionResult } from './ollama.service';
import { DocumentClassificationService, DocumentCategory } from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { AiFeedbackService } from './ai-feedback.service';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';
import {
  ExtractionContext,
  StrategyExtractionResult,
} from '../extraction/extraction-strategy.interface';
import { extractTextFromPdf } from '../utils/pdf-extractor.util';
import { levenshteinSimilarity, normalizeText } from '../utils/text-similarity.util';
import { computeDocumentTotals } from '../../../common/utils/document-totals';
import { assertTotalsFit } from '../../sales/utils/sales-helpers';

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
  taxAmount: number;
  total: number;
}

export interface DocumentIntakeResult {
  /** Classification */
  documentType: IntakeDocumentType;
  classificationConfidence: number;

  /** Extracted fields */
  extractedFields: {
    date: string | null;
    dueDate: string | null;
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    discount: number | null;
    documentNumber: string | null;
    vendorName: string | null;
    vendorAddress: string | null;
    vendorPhone: string | null;
    vendorEmail: string | null;
    vendorTaxId: string | null;
    currency: string | null;
    paymentTerms: string | null;
    notes: string | null;
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

  /** Raw text */
  rawText: string;

  /** Accounting entry suggestion */
  accountingEntry?: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  } | null;

  /** Suggested new vendor when no existing vendor matched */
  suggestCreateVendor: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
  } | null;

  /** Which AI engine extracted the data */
  extractionMethod: 'ollama-vision' | 'ollama-text' | 'ocr-llm' | 'hybrid-ocr' | 'hybrid-vlm';
}

/**
 * Confirm payload. Money and percentages travel as decimal strings; the
 * `taxRatePercent` is a percentage (14 => 14%), never a tax amount.
 */
export interface ConfirmIntakeLineInput {
  itemId?: string;
  accountId?: string;
  taxRateId?: string;
  description: string;
  quantity: string;
  rate: string;
  taxRatePercent?: string;
  discountPercent?: string;
}

export interface ConfirmIntakeInput {
  type: 'BILL' | 'INVOICE';
  vendorId?: string;
  customerId?: string;
  date: string;
  dueDate: string;
  documentNumber?: string;
  reference?: string;
  currencyCode?: string;
  lines: ConfirmIntakeLineInput[];
  notes?: string;
  projectId?: string;
  /** User corrections for AI learning */
  corrections?: Record<string, unknown>;
}

/** A confirmed line after tenant validation and Decimal computation. */
interface ResolvedIntakeLine {
  itemId: string | null;
  accountId: string | null;
  taxRateId: string | null;
  description: string;
  quantity: Decimal;
  rate: Decimal;
  taxRatePercent: Decimal;
  discountPercent: Decimal;
  netAmount: Decimal;
  taxAmount: Decimal;
}

interface ResolvedIntakeDocument {
  currencyCode: string;
  lines: ResolvedIntakeLine[];
  subtotal: Decimal;
  taxAmount: Decimal;
  grandTotal: Decimal;
}

// ---------------------------------------------------------------------------
// Async intake types
// ---------------------------------------------------------------------------

export type IntakeStage =
  | 'received'
  | 'extracting'
  | 'classifying'
  | 'matching'
  | 'complete'
  | 'error';

export interface IntakeProgressEvent {
  stage: IntakeStage;
  progress: number;
  message?: string;
  result?: DocumentIntakeResult;
  error?: string;
}

/** Truncate PDF raw text to this length before sending to Ollama (speeds up inference). */
const PDF_TEXT_TRUNCATION_LIMIT = 4000;

function uniqueIds(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DocumentIntakeService {
  private readonly logger = new Logger(DocumentIntakeService.name);

  constructor(
    private prisma: PrismaService,
    private ollamaService: OllamaService,
    private strategyResolver: ExtractionStrategyResolver,
    private classificationService: DocumentClassificationService,
    private entityExtractionService: EntityExtractionService,
    private feedbackService: AiFeedbackService,
    private configService: ConfigService,
  ) {}

  /**
   * Process a document through the AI intake pipeline (powered by Ollama).
   *
   * Pipeline:
   *  1. Extract structured data via Ollama (vision for images, text for PDFs)
   *  2. Classify document type (INVOICE, RECEIPT, PURCHASE_ORDER, etc.)
   *  3. Match vendor/customer against existing records
   *  4. Check for duplicates
   */
  async processDocument(
    organizationId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename?: string,
    _language: string = 'eng+ara',
    onProgress?: (stage: IntakeStage, progress: number, message: string) => void,
    strategy?: string,
  ): Promise<DocumentIntakeResult> {
    // Log metadata only — never file names, document text or extracted values.
    this.logger.log(
      `Processing document intake: org=${organizationId}, mime=${mimeType}, size=${fileBuffer.length}, strategy=${strategy || 'default'}`,
    );

    let rawText = '';
    let extraction: DocumentExtractionResult | null = null;
    let extractionMethod: DocumentIntakeResult['extractionMethod'] = 'ocr-llm';
    const isPdf = mimeType === 'application/pdf';

    // Step 1: Build extraction context
    onProgress?.('extracting', 20, 'AI is reading your document...');

    const context: ExtractionContext = {
      fileBuffer,
      mimeType,
      filename,
      language: _language,
      isPdf,
    };

    // For PDFs, extract text first (used by all strategies)
    if (isPdf) {
      try {
        const pdfResult = await extractTextFromPdf(fileBuffer);
        this.logger.log(
          `PDF extraction: pages=${pdfResult.pageCount}, native=${pdfResult.isNativeText}, textLen=${pdfResult.text.length}`,
        );
        context.pdfText = pdfResult.text;
        context.pdfIsNativeText = pdfResult.isNativeText;
        context.pdfPageCount = pdfResult.pageCount;
        if (pdfResult.text.length > 20) {
          rawText = pdfResult.text;
          if (rawText.length > PDF_TEXT_TRUNCATION_LIMIT) {
            rawText = rawText.slice(0, PDF_TEXT_TRUNCATION_LIMIT);
            context.pdfText = rawText;
          }
        }
      } catch (error) {
        this.logger.warn(
          `PDF text extraction failed: ${error instanceof Error ? error.name : 'unknown error'}`,
        );
      }
    }

    // Step 2: Resolve and execute extraction strategy
    const strategyResult = await this.strategyResolver.resolve(context, strategy);

    if (strategyResult) {
      extraction = strategyResult.extraction;
      rawText = extraction.rawText || rawText;
      extractionMethod = this.mapStrategyToMethod(strategyResult);
      this.logger.log(
        `Strategy ${strategyResult.strategyUsed} (${strategyResult.subPathUsed || 'direct'}) succeeded: ` +
          `confidence=${extraction.ocrConfidence.toFixed(2)}, time=${strategyResult.totalTimeMs}ms`,
      );
    }

    // Step 2b: Fallback — empty result if all strategies failed
    if (!extraction) {
      this.logger.warn('All extraction strategies failed — returning empty result');
      extraction = this.ollamaService.buildEmptyResult(rawText);
    }

    // Step 2: Classify document — use embedded category from extraction, or fall back to classifier
    let classificationPromise: Promise<{ category: DocumentCategory; confidence: number }>;
    if (extraction.documentCategory) {
      const category = this.mapRawCategoryToDocumentCategory(extraction.documentCategory);
      classificationPromise = Promise.resolve({
        category,
        confidence: extraction.ocrConfidence || 0.8,
      });
    } else {
      classificationPromise = this.classificationService.classifyDocument(
        organizationId,
        rawText,
        filename,
      );
    }

    onProgress?.('classifying', 60, 'Classifying and matching...');

    // Step 3: Run classification + entity matching in parallel (both only need rawText)
    const [classification, entityResult] = await Promise.all([
      classificationPromise,
      this.entityExtractionService.extractAndMatch(organizationId, rawText, { useOllama: false }),
    ]);

    const documentType = this.mapClassificationToType(classification.category);

    this.logger.log(
      `Classification: ${classification.category} (${(classification.confidence * 100).toFixed(1)}%) → ${documentType}`,
    );

    onProgress?.('matching', 80, 'Matching vendors and customers...');

    // Step 4: Build vendor/customer candidate lists
    const { vendorCandidates, matchedVendor } = await this.matchVendors(
      organizationId,
      extraction.vendorName,
      entityResult.matches,
    );

    const { customerCandidates, matchedCustomer } = await this.matchCustomers(
      organizationId,
      entityResult.matches,
    );

    // Step 5: Duplicate check
    let duplicateWarning: DocumentIntakeResult['duplicateWarning'] = null;
    if (matchedVendor && (extraction.invoiceNumber || extraction.total)) {
      duplicateWarning = await this.checkDuplicate(
        organizationId,
        matchedVendor.id,
        extraction.invoiceNumber,
        extraction.total,
      );
    }

    // Step 6: Use extracted dueDate, fall back to +30 days from invoice date
    let dueDate: string | null = extraction.dueDate;
    if (!dueDate && extraction.date) {
      try {
        const dateObj = new Date(extraction.date);
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

    // Build vendor creation suggestion when no vendor matched
    const suggestCreateVendor =
      !matchedVendor && extraction.vendorName
        ? {
            name: extraction.vendorName,
            address: extraction.vendorAddress,
            phone: extraction.vendorPhone,
            email: extraction.vendorEmail,
            taxId: extraction.vendorTaxId,
          }
        : null;

    return {
      documentType,
      classificationConfidence: classification.confidence,
      extractedFields: {
        date: extraction.date,
        dueDate,
        total: extraction.total,
        subtotal: extraction.subtotal,
        tax: extraction.tax,
        discount: extraction.discount,
        documentNumber: extraction.invoiceNumber,
        vendorName: extraction.vendorName,
        vendorAddress: extraction.vendorAddress,
        vendorPhone: extraction.vendorPhone,
        vendorEmail: extraction.vendorEmail,
        vendorTaxId: extraction.vendorTaxId,
        currency: extraction.currency,
        paymentTerms: extraction.paymentTerms,
        notes: extraction.notes,
        customerName: customerNameFromEntities,
        lineItems: extraction.lineItems,
      },
      fieldConfidence: extraction.fieldConfidence,
      ocrConfidence: extraction.ocrConfidence,
      matchedVendor,
      vendorCandidates,
      matchedCustomer,
      customerCandidates,
      duplicateWarning,
      rawText,
      accountingEntry: extraction.accountingEntry,
      suggestCreateVendor,
      extractionMethod,
    };
  }

  /**
   * Confirm extracted data and create a draft Bill or Invoice.
   *
   * Every referenced id (party, project, item, account, tax rate) is verified to
   * belong to `organizationId` before anything is written; a foreign or unknown
   * id is rejected with 400 and no mutation. Totals come from the shared Decimal
   * calculator: `taxRatePercent` is a percentage, line `amount` is the net.
   */
  async confirmAndCreate(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<{ type: 'bill' | 'invoice'; id: string; number: string }> {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    if (dto.type === 'BILL') {
      return this.createDraftBill(organizationId, dto);
    }
    if (dto.type === 'INVOICE') {
      return this.createDraftInvoice(organizationId, dto);
    }
    throw new BadRequestException('type must be BILL or INVOICE');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate tenant ownership of every referenced id and compute totals.
   * Read-only: performs no writes.
   */
  private async resolveConfirmation(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<ResolvedIntakeDocument> {
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('At least one line is required');
    }
    for (const field of ['date', 'dueDate'] as const) {
      const value = dto[field];
      if (!value || isNaN(new Date(value).getTime())) {
        throw new BadRequestException(`${field} must be a valid date`);
      }
    }

    // Party
    if (dto.type === 'BILL') {
      if (!dto.vendorId) {
        throw new BadRequestException('Vendor is required to create a bill');
      }
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!vendor) {
        throw new BadRequestException('vendorId does not reference a vendor in this organization');
      }
    } else {
      if (!dto.customerId) {
        throw new BadRequestException('Customer is required to create an invoice');
      }
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException(
          'customerId does not reference a customer in this organization',
        );
      }
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        throw new BadRequestException(
          'projectId does not reference a project in this organization',
        );
      }
    }

    const itemIds = uniqueIds(dto.lines.map((l) => l.itemId));
    const accountIds = uniqueIds(dto.lines.map((l) => l.accountId));
    const taxRateIds = uniqueIds(dto.lines.map((l) => l.taxRateId));

    if (itemIds.length > 0) {
      const items = await this.prisma.item.findMany({
        where: { id: { in: itemIds }, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (items.length !== itemIds.length) {
        throw new BadRequestException('itemId does not reference an item in this organization');
      }
    }

    if (accountIds.length > 0) {
      const accounts = await this.prisma.account.findMany({
        where: { id: { in: accountIds }, organizationId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (accounts.length !== accountIds.length) {
        throw new BadRequestException(
          'accountId does not reference an active account in this organization',
        );
      }
    }

    const taxRatePercentById = new Map<string, Decimal>();
    if (taxRateIds.length > 0) {
      const taxRates = await this.prisma.taxRate.findMany({
        where: { id: { in: taxRateIds }, organizationId, deletedAt: null, isActive: true },
        select: { id: true, rate: true },
      });
      if (taxRates.length !== taxRateIds.length) {
        throw new BadRequestException(
          'taxRateId does not reference an active tax rate in this organization',
        );
      }
      for (const tr of taxRates) taxRatePercentById.set(tr.id, new Decimal(tr.rate.toString()));
    }

    // The ledger is single-currency: reject a foreign currency instead of posting it 1:1.
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    if (!org) throw new BadRequestException('Organization not found');
    const currencyCode = dto.currencyCode?.trim().toUpperCase() || org.baseCurrency.toUpperCase();
    if (currencyCode !== org.baseCurrency.toUpperCase()) {
      throw new BadRequestException(
        `Document currency ${currencyCode} differs from the base currency ${org.baseCurrency}; foreign-currency documents are not supported yet`,
      );
    }

    // Per-line tax/discount resolution. Unresolved tax is an error, never a silent 0.
    const prepared = dto.lines.map((line, index) => {
      const lineNo = index + 1;
      const discountPercent = new Decimal(line.discountPercent || '0');
      if (dto.type === 'BILL' && !discountPercent.isZero()) {
        throw new BadRequestException(
          `Line ${lineNo}: line discounts are not supported on bills; enter the net rate`,
        );
      }

      let taxRatePercent: Decimal | null =
        line.taxRatePercent !== undefined && line.taxRatePercent !== ''
          ? new Decimal(line.taxRatePercent)
          : null;
      if (line.taxRateId) {
        const recordPercent = taxRatePercentById.get(line.taxRateId);
        if (!recordPercent) {
          throw new BadRequestException(`Line ${lineNo}: unknown taxRateId`);
        }
        if (taxRatePercent && !taxRatePercent.equals(recordPercent)) {
          throw new BadRequestException(
            `Line ${lineNo}: taxRatePercent does not match the selected tax rate`,
          );
        }
        taxRatePercent = recordPercent;
      }
      if (taxRatePercent === null) {
        throw new BadRequestException(
          `Line ${lineNo}: tax rate is unresolved; provide taxRatePercent (use "0" for no tax) or taxRateId`,
        );
      }

      return {
        itemId: line.itemId || null,
        accountId: line.accountId || null,
        taxRateId: line.taxRateId || null,
        description: line.description,
        quantity: new Decimal(line.quantity),
        rate: new Decimal(line.rate),
        taxRatePercent,
        discountPercent,
      };
    });

    const totals = computeDocumentTotals(
      prepared.map((l) => ({
        quantity: l.quantity,
        rate: l.rate,
        taxRatePercent: l.taxRatePercent,
        discountPercent: l.discountPercent,
      })),
    );

    // Same Decimal(19, 4) bound as manual invoices/bills: nothing is written that cannot be stored.
    assertTotalsFit(totals);

    return {
      currencyCode,
      lines: prepared.map((l, i) => ({
        ...l,
        netAmount: totals.lines[i].netAmount,
        taxAmount: totals.lines[i].taxAmount,
      })),
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
    };
  }

  private async createDraftBill(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<{ type: 'bill'; id: string; number: string }> {
    const resolved = await this.resolveConfirmation(organizationId, dto);
    const vendorId = dto.vendorId as string;

    const billNumber = dto.documentNumber || (await this.generateBillNumber(organizationId));

    const bill = await this.prisma.bill.create({
      data: {
        billNumber,
        vendorId,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: resolved.subtotal,
        taxAmount: resolved.taxAmount,
        grandTotal: resolved.grandTotal,
        balanceDue: resolved.grandTotal,
        reference: dto.reference,
        currencyCode: resolved.currencyCode,
        notes: dto.notes || 'Created from document scan',
        projectId: dto.projectId || null,
        organizationId,
        lines: {
          create: resolved.lines.map((line) => ({
            itemId: line.itemId,
            accountId: line.accountId,
            taxRateId: line.taxRateId,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            taxRate: line.taxRatePercent,
            amount: line.netAmount,
          })),
        },
      },
      select: { id: true },
    });

    // Log feedback for AI improvement
    try {
      await this.feedbackService.processFeedback(organizationId, {
        feature: AiFeature.DOCUMENT_CLASSIFICATION,
        aiSuggestion: { type: 'document_intake', documentType: 'BILL' },
        userAction: dto.corrections ? AiFeedbackAction.CORRECTED : AiFeedbackAction.ACCEPTED,
        userAnswer: dto.corrections ? JSON.stringify(dto.corrections) : undefined,
        inputData: { billNumber, vendorId },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log intake feedback: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }

    this.logger.log(
      `Created draft bill ${bill.id} (${resolved.lines.length} lines) from document intake for org ${organizationId}`,
    );

    return { type: 'bill', id: bill.id, number: billNumber };
  }

  private async createDraftInvoice(
    organizationId: string,
    dto: ConfirmIntakeInput,
  ): Promise<{ type: 'invoice'; id: string; number: string }> {
    const resolved = await this.resolveConfirmation(organizationId, dto);
    const customerId = dto.customerId as string;

    const invoiceNumber = await this.generateInvoiceNumber(organizationId);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        projectId: dto.projectId || null,
        date: new Date(dto.date),
        dueDate: new Date(dto.dueDate),
        subtotal: resolved.subtotal,
        taxAmount: resolved.taxAmount,
        shippingAmount: new Decimal(0),
        grandTotal: resolved.grandTotal,
        balanceDue: resolved.grandTotal,
        currencyCode: resolved.currencyCode,
        notes: dto.notes || 'Created from document scan',
        organizationId,
        lines: {
          // InvoiceLine has no accountId column; a supplied account is only validated.
          create: resolved.lines.map((line) => ({
            itemId: line.itemId,
            taxRateId: line.taxRateId,
            description: line.description,
            quantity: line.quantity,
            rate: line.rate,
            discount: line.discountPercent,
            taxRate: line.taxRatePercent,
            amount: line.netAmount,
          })),
        },
      },
      select: { id: true },
    });

    this.logger.log(
      `Created draft invoice ${invoice.id} (${resolved.lines.length} lines) from document intake for org ${organizationId}`,
    );

    return { type: 'invoice', id: invoice.id, number: invoiceNumber };
  }

  private mapStrategyToMethod(
    result: StrategyExtractionResult,
  ): DocumentIntakeResult['extractionMethod'] {
    if (result.strategyUsed === 'hybrid') {
      return result.subPathUsed === 'vlm-fallback' ? 'hybrid-vlm' : 'hybrid-ocr';
    }
    if (result.strategyUsed === 'vlm') return 'ollama-vision';
    if (result.strategyUsed === 'ocr-llm') return 'ocr-llm';
    return 'ocr-llm';
  }

  private mapRawCategoryToDocumentCategory(raw: string): DocumentCategory {
    const upper = raw.toUpperCase().trim();
    return Object.values(DocumentCategory).includes(upper as DocumentCategory)
      ? (upper as DocumentCategory)
      : DocumentCategory.OTHER;
  }

  private mapClassificationToType(category: DocumentCategory): IntakeDocumentType {
    switch (category) {
      case DocumentCategory.INVOICE:
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
   * Check for duplicate bills by invoice number or amount+date similarity.
   */
  private async checkDuplicate(
    organizationId: string,
    vendorId: string,
    invoiceNumber: string | null,
    total: number | null,
  ): Promise<DocumentIntakeResult['duplicateWarning']> {
    // Check exact invoice number match
    if (invoiceNumber) {
      const existing = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId,
          billNumber: invoiceNumber,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existing) {
        return {
          isDuplicate: true,
          existingId: existing.id,
          matchType: 'exact_number',
          similarity: 1.0,
        };
      }
    }

    // Check amount + recent date similarity
    if (total && total > 0) {
      const recentBills = await this.prisma.bill.findMany({
        where: {
          organizationId,
          vendorId,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { id: true, grandTotal: true },
      });

      for (const bill of recentBills) {
        const billTotal = Number(bill.grandTotal);
        if (Math.abs(billTotal - total) < 0.01) {
          return {
            isDuplicate: true,
            existingId: bill.id,
            matchType: 'amount_match',
            similarity: 0.9,
          };
        }
      }
    }

    return null;
  }

  private async matchVendors(
    organizationId: string,
    extractedVendorName: string | null,
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
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, displayName: true },
    });

    if (vendors.length === 0) {
      return { vendorCandidates: [], matchedVendor: null };
    }

    const candidateMap = new Map<string, VendorCandidate>();

    for (const match of entityMatches) {
      if (match.matchType === 'vendor') {
        candidateMap.set(match.matchedId, {
          id: match.matchedId,
          name: match.matchedName,
          similarity: match.similarity,
        });
      }
    }

    if (extractedVendorName) {
      const vendorNames = vendors.map((v) => v.displayName || v.name);
      const topMatches = this.findTopMatches(extractedVendorName, vendorNames, vendors, 5, 0.4);

      for (const match of topMatches) {
        const existing = candidateMap.get(match.id);
        if (!existing || match.similarity > existing.similarity) {
          candidateMap.set(match.id, match);
        }
      }
    }

    const vendorCandidates = [...candidateMap.values()].sort((a, b) => b.similarity - a.similarity);

    const matchedVendor =
      vendorCandidates.length > 0 && vendorCandidates[0].similarity >= 0.6
        ? vendorCandidates[0]
        : null;

    return { vendorCandidates: vendorCandidates.slice(0, 5), matchedVendor };
  }

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
      const similarity = levenshteinSimilarity(normalizedTarget, normalizeText(names[i]));
      if (similarity >= threshold) {
        results.push({
          id: records[i].id,
          name: names[i],
          similarity: Math.round(similarity * 1000) / 1000,
        });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topN);
  }

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

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
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
