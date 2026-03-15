import { Injectable, Logger } from '@nestjs/common';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  OLLAMA_EXTRACTION_SYSTEM_PROMPT,
  OLLAMA_VISION_PROMPT,
  buildTextExtractionPrompt,
} from '../prompts/ollama-extraction.prompts';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  total: number;
}

export interface DocumentExtractionResult {
  vendorName: string | null;
  vendorAddress: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  date: string | null;
  dueDate: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  currency: string | null;
  paymentTerms: string | null;
  notes: string | null;
  lineItems: ExtractedLineItem[];
  rawText: string;
  ocrConfidence: number;
  fieldConfidence: Record<string, number>;
  documentCategory: string | null;
  accountingEntry: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  } | null;
  processingTimeMs: number;
}

// Raw shape returned by Ollama (matches the prompt JSON schema)
interface OllamaExtractionRaw {
  vendorName?: string | null;
  vendorAddress?: string | null;
  vendorPhone?: string | null;
  vendorEmail?: string | null;
  vendorTaxId?: string | null;
  invoiceNumber?: string | null;
  date?: string | null;
  dueDate?: string | null;
  total?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  discount?: number | null;
  currency?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    taxAmount?: number;
    total?: number;
  }>;
  confidence?: {
    overall?: number;
    [field: string]: number | undefined;
  };
  documentCategory?: string | null;
  accountingEntry?: {
    debitAccount?: string | null;
    creditAccount?: string | null;
    taxAccount?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Document extraction service powered by Ollama.
 *
 * Uses the OllamaInferenceGateway to extract structured invoice/bill data
 * from images (vision model) or raw text (text model).
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  constructor(private readonly gateway: OllamaInferenceGateway) {}

  /** Max file size in bytes for processed images sent to Ollama (100KB). */
  private static readonly MAX_IMAGE_BYTES = 100 * 1024;
  /** Starting max dimension — will be reduced if image exceeds MAX_IMAGE_BYTES. */
  private static readonly INITIAL_MAX_DIM = 1536;
  /** Starting JPEG quality — will be reduced if image exceeds MAX_IMAGE_BYTES. */
  private static readonly INITIAL_JPEG_QUALITY = 85;

  /**
   * Extract document data from an image using Ollama's vision model.
   *
   * Preprocessing pipeline:
   *  1. HEIC/HEIF → JPEG (via sharp or heic-convert fallback)
   *  2. Progressively resize + reduce quality until ≤ 100KB
   *  3. Sharpen + normalize contrast for text readability
   *
   * Returns null if Ollama is unavailable or extraction fails.
   */
  async extractFromImageVision(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<DocumentExtractionResult | null> {
    let processed: Buffer;
    try {
      processed = await this.preprocessImage(fileBuffer, mimeType);
    } catch (err) {
      this.logger.error(`Image preprocessing failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
    const base64 = processed.toString('base64');

    this.logger.log(
      `Ollama vision extraction: mimeType=${mimeType}, original=${fileBuffer.length}b, ` +
        `processed=${processed.length}b, base64=${(base64.length / 1024).toFixed(0)}KB`,
    );

    const result = await this.gateway.inferWithImages<OllamaExtractionRaw>(
      OLLAMA_VISION_PROMPT,
      [base64],
      {
        systemPrompt: OLLAMA_EXTRACTION_SYSTEM_PROMPT,
        timeoutMs: 300_000,
        maxTokens: 16384,
      },
    );

    if (!result) {
      this.logger.warn('Ollama vision extraction returned null');
      return null;
    }

    return this.toDocumentExtractionResult(result.data, '', result.processingTimeMs);
  }

  /**
   * Preprocess an image for Ollama Vision:
   *  1. Convert HEIC/HEIF → JPEG (via sharp or heic-convert fallback)
   *  2. Progressively resize + reduce quality until ≤ 100KB
   *  3. Apply sharpening + contrast normalization for text readability
   */
  private async preprocessImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';

    // Step 1: Convert HEIC → JPEG first (if needed) so all later steps work on JPEG
    let jpegBuffer = buffer;
    if (isHeic) {
      jpegBuffer = await this.convertHeicToJpeg(buffer);
    }

    // Step 2: Resize + compress to fit under MAX_IMAGE_BYTES using sharp
    const compressed = await this.compressToTarget(jpegBuffer, mimeType);
    if (compressed) return compressed;

    // Step 3: If sharp unavailable, return the JPEG as-is (heic-convert result or original)
    return jpegBuffer;
  }

  /** Convert HEIC buffer to JPEG. Tries sharp first, falls back to heic-convert. */
  private async convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
    // Try sharp HEIC decode
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp');
      const result = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
      this.logger.log(
        `HEIC → JPEG (sharp): ${(buffer.length / 1024).toFixed(0)}KB → ${(result.length / 1024).toFixed(0)}KB`,
      );
      return result;
    } catch {
      // sharp unavailable or can't decode HEIC
    }

    // Fall back to heic-convert (pure JS)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const convert = require('heic-convert');
      const result = await convert({ buffer, format: 'JPEG', quality: 0.9 });
      const converted = Buffer.from(result);
      this.logger.log(
        `HEIC → JPEG (heic-convert): ${(buffer.length / 1024).toFixed(0)}KB → ${(converted.length / 1024).toFixed(0)}KB`,
      );
      return converted;
    } catch (err) {
      throw new Error(
        `HEIC conversion failed: ${err instanceof Error ? err.message : err}. Please convert to JPEG before uploading.`,
      );
    }
  }

  /**
   * Progressively resize and reduce JPEG quality until the image is ≤ MAX_IMAGE_BYTES.
   * Returns null if sharp is unavailable.
   */
  private async compressToTarget(buffer: Buffer, originalMimeType: string): Promise<Buffer | null> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let sharp: ReturnType<typeof require>;
    try {
      sharp = require('sharp');
    } catch {
      this.logger.warn('sharp not available for compression');
      return null;
    }

    try {
      const meta = await sharp(buffer).metadata();
      const origW = meta.width ?? 0;
      const origH = meta.height ?? 0;
      const origDim = Math.max(origW, origH);

      this.logger.log(
        `compressToTarget: input ${origW}x${origH} (${(buffer.length / 1024).toFixed(0)}KB), target ≤${(OllamaService.MAX_IMAGE_BYTES / 1024).toFixed(0)}KB`,
      );

      // If already under target, return as-is
      if (buffer.length <= OllamaService.MAX_IMAGE_BYTES) {
        this.logger.log('compressToTarget: already under target, skipping');
        return buffer;
      }

      let maxDim = Math.min(origDim, OllamaService.INITIAL_MAX_DIM);
      let quality = OllamaService.INITIAL_JPEG_QUALITY;
      let result: Buffer;
      let iteration = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        iteration++;
        result = await sharp(buffer)
          .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer();

        this.logger.debug(
          `compressToTarget iteration ${iteration}: ${maxDim}px q${quality} → ${(result.length / 1024).toFixed(0)}KB`,
        );

        if (result.length <= OllamaService.MAX_IMAGE_BYTES) break;

        // Reduce quality first, then shrink dimensions
        if (quality > 30) {
          quality -= 10;
        } else if (maxDim > 400) {
          maxDim = Math.round(maxDim * 0.7);
          quality = OllamaService.INITIAL_JPEG_QUALITY;
        } else {
          break; // smallest possible
        }
      }

      this.logger.log(
        `Compressed: ${origW}x${origH} (${originalMimeType}) → JPEG ${maxDim}px q${quality} ` +
          `(${(buffer.length / 1024).toFixed(0)}KB → ${(result.length / 1024).toFixed(0)}KB)`,
      );
      return result;
    } catch (err) {
      this.logger.warn(`sharp compression failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /**
   * Extract document data from raw text using Ollama's text model.
   * Returns null if Ollama is unavailable or extraction fails.
   */
  async extractFromText(rawText: string): Promise<DocumentExtractionResult | null> {
    this.logger.log(`Ollama text extraction: textLen=${rawText.length}`);

    const prompt = buildTextExtractionPrompt(rawText);

    const result = await this.gateway.infer<OllamaExtractionRaw>(prompt, {
      systemPrompt: OLLAMA_EXTRACTION_SYSTEM_PROMPT,
    });

    if (!result) {
      this.logger.warn('Ollama text extraction returned null');
      return null;
    }

    return this.toDocumentExtractionResult(result.data, rawText, result.processingTimeMs);
  }

  /**
   * Build an empty extraction result (when Ollama is unavailable).
   */
  buildEmptyResult(rawText: string = ''): DocumentExtractionResult {
    return {
      vendorName: null,
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      invoiceNumber: null,
      date: null,
      dueDate: null,
      total: null,
      subtotal: null,
      tax: null,
      discount: null,
      currency: null,
      paymentTerms: null,
      notes: null,
      lineItems: [],
      rawText,
      ocrConfidence: 0,
      fieldConfidence: {},
      documentCategory: null,
      accountingEntry: null,
      processingTimeMs: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDocumentExtractionResult(
    raw: OllamaExtractionRaw,
    rawText: string,
    processingTimeMs: number,
  ): DocumentExtractionResult {
    const lineItems: ExtractedLineItem[] = (raw.lineItems || []).map((item) => ({
      description: item.description || '',
      quantity: item.quantity || 0,
      unitPrice: item.unitPrice || 0,
      taxAmount: item.taxAmount || 0,
      total: item.total || 0,
    }));

    const confidence = raw.confidence || {};
    const fieldConfidence: Record<string, number> = {};
    for (const [key, value] of Object.entries(confidence)) {
      if (key !== 'overall' && typeof value === 'number') {
        fieldConfidence[key] = value;
      }
    }

    return {
      vendorName: raw.vendorName ?? null,
      vendorAddress: raw.vendorAddress ?? null,
      vendorPhone: raw.vendorPhone ?? null,
      vendorEmail: raw.vendorEmail ?? null,
      vendorTaxId: raw.vendorTaxId ?? null,
      invoiceNumber: raw.invoiceNumber ?? null,
      date: raw.date ?? null,
      dueDate: raw.dueDate ?? null,
      total: raw.total ?? null,
      subtotal: raw.subtotal ?? null,
      tax: raw.tax ?? null,
      discount: raw.discount ?? null,
      currency: raw.currency ?? null,
      paymentTerms: raw.paymentTerms ?? null,
      notes: raw.notes ?? null,
      lineItems,
      rawText,
      ocrConfidence: confidence.overall ?? 0,
      fieldConfidence,
      documentCategory: raw.documentCategory ?? null,
      accountingEntry: raw.accountingEntry
        ? {
            debitAccount: raw.accountingEntry.debitAccount ?? null,
            creditAccount: raw.accountingEntry.creditAccount ?? null,
            taxAccount: raw.accountingEntry.taxAccount ?? null,
          }
        : null,
      processingTimeMs,
    };
  }
}
