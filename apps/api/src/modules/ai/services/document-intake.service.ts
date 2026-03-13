import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeature, AiFeedbackAction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { OllamaService, DocumentExtractionResult } from './ollama.service';
import { DocumentClassificationService, DocumentCategory } from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { AiFeedbackService } from './ai-feedback.service';
import { extractTextFromPdf } from '../utils/pdf-extractor.util';
import { levenshteinSimilarity, normalizeText } from '../utils/text-similarity.util';
import { BoundedCache } from '../utils/bounded-cache.util';

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
  extractionMethod: 'ollama-vision' | 'ollama-text';
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
  /** User corrections for AI learning */
  corrections?: Record<string, unknown>;
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

export interface IntakeJob {
  jobId: string;
  status: IntakeStage;
  progress: number;
  result: DocumentIntakeResult | null;
  error: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DocumentIntakeService {
  private readonly logger = new Logger(DocumentIntakeService.name);

  /** In-memory job store with bounded size and TTL */
  private readonly jobs = new BoundedCache<IntakeJob>(200, 30 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    private ollamaService: OllamaService,
    private classificationService: DocumentClassificationService,
    private entityExtractionService: EntityExtractionService,
    private feedbackService: AiFeedbackService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Async job management
  // ---------------------------------------------------------------------------

  /**
   * Start document processing as a background job.
   * Returns a jobId immediately so the caller can stream progress via SSE.
   */
  processDocumentAsync(
    organizationId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename?: string,
    language: string = 'eng+ara',
  ): string {
    const jobId = `intake_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const job: IntakeJob = {
      jobId,
      status: 'received',
      progress: 5,
      result: null,
      error: null,
      createdAt: Date.now(),
    };
    this.jobs.set(jobId, job);

    // Emit initial received event
    this.emitProgress(jobId, { stage: 'received', progress: 5, message: 'File accepted' });

    // Fire off the pipeline in the background (non-blocking)
    void this.runAsyncPipeline(jobId, organizationId, fileBuffer, mimeType, filename, language);

    return jobId;
  }

  /** Retrieve a job by ID. */
  getJob(jobId: string): IntakeJob | undefined {
    return this.jobs.get(jobId);
  }

  private emitProgress(jobId: string, event: IntakeProgressEvent): void {
    // Update in-memory job
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = event.stage;
      job.progress = event.progress;
      if (event.result) job.result = event.result;
      if (event.error) job.error = event.error;
      this.jobs.set(jobId, job);
    }
    this.eventEmitter.emit(`document-intake.progress.${jobId}`, event);
  }

  private async runAsyncPipeline(
    jobId: string,
    organizationId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename?: string,
    language?: string,
  ): Promise<void> {
    try {
      this.emitProgress(jobId, {
        stage: 'extracting',
        progress: 20,
        message: 'AI is reading your document...',
      });

      const result = await this.processDocument(
        organizationId,
        fileBuffer,
        mimeType,
        filename,
        language,
        (stage, progress, message) => this.emitProgress(jobId, { stage, progress, message }),
      );

      this.emitProgress(jobId, {
        stage: 'complete',
        progress: 100,
        message: 'Processing complete',
        result,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Async intake pipeline failed for job ${jobId}: ${msg}`);
      this.emitProgress(jobId, {
        stage: 'error',
        progress: 0,
        error: msg,
      });
    }
  }

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
  ): Promise<DocumentIntakeResult> {
    this.logger.log(
      `Processing document intake: mime=${mimeType}, size=${fileBuffer.length}, file=${filename || 'unknown'}`,
    );

    let rawText = '';
    let extraction: DocumentExtractionResult | null = null;
    let extractionMethod: DocumentIntakeResult['extractionMethod'] = 'ollama-vision';
    const isPdf = mimeType === 'application/pdf';

    // Step 1a: For images, use Ollama vision model
    onProgress?.('extracting', 20, 'AI is reading your document...');
    if (!isPdf) {
      extraction = await this.ollamaService.extractFromImageVision(fileBuffer, mimeType);
      if (extraction) {
        rawText = extraction.rawText;
        extractionMethod = 'ollama-vision';
        this.logger.log(
          `Ollama vision extraction succeeded: confidence=${extraction.ocrConfidence}, time=${extraction.processingTimeMs}ms`,
        );
      }
    }

    // Step 1b: For PDFs, extract text first then use Ollama text model
    if (!extraction && isPdf) {
      try {
        const pdfResult = await extractTextFromPdf(fileBuffer);
        this.logger.log(
          `PDF extraction: pages=${pdfResult.pageCount}, native=${pdfResult.isNativeText}, textLen=${pdfResult.text.length}`,
        );
        if (pdfResult.text.length > 20) {
          rawText = pdfResult.text;
        }
      } catch (error) {
        this.logger.warn(`PDF text extraction failed: ${error}`);
      }

      if (rawText) {
        extraction = await this.ollamaService.extractFromText(rawText);
        if (extraction) {
          rawText = extraction.rawText || rawText;
          extractionMethod = 'ollama-text';
          this.logger.log(
            `Ollama text extraction from PDF succeeded: confidence=${extraction.ocrConfidence}`,
          );
        }
      }
    }

    // Step 1c: Fallback — empty result if Ollama unavailable
    if (!extraction) {
      this.logger.warn('Ollama extraction unavailable — returning empty result');
      extraction = this.ollamaService.buildEmptyResult(rawText);
    }

    // Step 2: Classify document
    onProgress?.('classifying', 60, 'Classifying document type...');
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
    onProgress?.('matching', 80, 'Matching vendors and customers...');
    const entityResult = await this.entityExtractionService.extractAndMatch(
      organizationId,
      rawText,
    );

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

  private async createDraftBill(
    organizationId: string,
    dto: ConfirmIntakeDto,
  ): Promise<{ type: 'bill'; id: string; number: string }> {
    if (!dto.vendorId) {
      throw new BadRequestException('Vendor is required to create a bill');
    }

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, organizationId, deletedAt: null },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const billNumber = dto.documentNumber || (await this.generateBillNumber(organizationId));

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

    // Log feedback for AI improvement
    try {
      await this.feedbackService.processFeedback(organizationId, {
        feature: AiFeature.DOCUMENT_CLASSIFICATION,
        aiSuggestion: { type: 'document_intake', documentType: 'BILL' },
        userAction: dto.corrections ? AiFeedbackAction.CORRECTED : AiFeedbackAction.ACCEPTED,
        userAnswer: dto.corrections ? JSON.stringify(dto.corrections) : undefined,
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

  private async createDraftInvoice(
    organizationId: string,
    dto: ConfirmIntakeDto,
  ): Promise<{ type: 'invoice'; id: string; number: string }> {
    if (!dto.customerId) {
      throw new BadRequestException('Customer is required to create an invoice');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const invoiceNumber = await this.generateInvoiceNumber(organizationId);

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
