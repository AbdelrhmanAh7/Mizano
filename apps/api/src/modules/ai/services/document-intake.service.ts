import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
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
import {
  DocumentIntakeResult,
  IntakeProgressEvent,
  IntakeStage,
  VendorCandidate,
  CustomerCandidate,
  IntakeDocumentType,
} from './document-intake.types';

// Re-export types for consumers
export type {
  DocumentIntakeResult,
  IntakeProgressEvent,
  IntakeStage,
  VendorCandidate,
  CustomerCandidate,
  IntakeDocumentType,
};

/** Truncate PDF raw text to this length before sending to Ollama (speeds up inference). */
const PDF_TEXT_TRUNCATION_LIMIT = 4000;

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
   *
   * NOTE: This method runs in the WORKER process only. The API process enqueues
   * jobs to Redis/BullMQ and the worker consumes them.
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
      fieldEvidence: extraction.fieldEvidence,
      extractionWarnings: extraction.extractionWarnings,
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mapStrategyToMethod(
    result: StrategyExtractionResult,
  ): DocumentIntakeResult['extractionMethod'] {
    if (result.strategyUsed === 'hybrid') {
      return result.subPathUsed === 'vlm-fallback' ? 'hybrid-vlm' : 'hybrid-ocr';
    }
    if (result.strategyUsed === 'rules') return 'rules';
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
}
