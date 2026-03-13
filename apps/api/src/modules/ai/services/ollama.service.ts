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
    total?: number;
  }>;
  confidence?: {
    overall?: number;
    [field: string]: number | undefined;
  };
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

  /** Max pixels on the longest side before we resize for Ollama vision. */
  private static readonly MAX_IMAGE_DIM = 1536;
  /** JPEG quality for preprocessed images (0-100). */
  private static readonly JPEG_QUALITY = 85;

  /**
   * Extract document data from an image using Ollama's vision model.
   *
   * Preprocessing pipeline:
   *  1. HEIC/HEIF → JPEG (via heic-convert, pure JS)
   *  2. Resize to max 1536px on longest side (via sharp)
   *  3. Re-encode as JPEG @ quality 85
   *
   * Returns null if Ollama is unavailable or extraction fails.
   */
  async extractFromImageVision(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<DocumentExtractionResult | null> {
    const processed = await this.preprocessImage(fileBuffer, mimeType);
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
        maxTokens: 8192,
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
   *  1. Convert HEIC/HEIF → JPEG (pure JS, works on all platforms)
   *  2. Resize large images to fit within MAX_IMAGE_DIM
   *  3. Re-encode as JPEG
   *
   * Falls back to the original buffer if preprocessing fails.
   */
  private async preprocessImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    let imageBuffer = buffer;

    // Step 1: HEIC/HEIF → JPEG
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires -- heic-convert is CJS-only
        const convert = require('heic-convert');
        const result = await convert({
          buffer: imageBuffer,
          format: 'JPEG',
          quality: OllamaService.JPEG_QUALITY / 100,
        });
        imageBuffer = Buffer.from(result);
        this.logger.log(`HEIC → JPEG: ${buffer.length} → ${imageBuffer.length} bytes`);
      } catch (err) {
        this.logger.warn(`HEIC conversion failed: ${err instanceof Error ? err.message : err}`);
        return buffer;
      }
    }

    // Step 2: Resize with sharp (caps at 1536px longest side)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- dynamic require for optional dep
      const sharp = require('sharp');
      const meta = await sharp(imageBuffer).metadata();
      const maxDim = Math.max(meta.width ?? 0, meta.height ?? 0);

      if (maxDim > OllamaService.MAX_IMAGE_DIM) {
        const resized = await sharp(imageBuffer)
          .resize(OllamaService.MAX_IMAGE_DIM, OllamaService.MAX_IMAGE_DIM, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: OllamaService.JPEG_QUALITY })
          .toBuffer();

        this.logger.log(
          `Resized: ${meta.width}x${meta.height} → max ${OllamaService.MAX_IMAGE_DIM}px ` +
            `(${imageBuffer.length} → ${resized.length} bytes)`,
        );
        return resized;
      }

      // Small enough — just ensure JPEG format
      if (mimeType !== 'image/jpeg' && mimeType !== 'image/jpg') {
        return sharp(imageBuffer).jpeg({ quality: OllamaService.JPEG_QUALITY }).toBuffer();
      }

      return imageBuffer;
    } catch (err) {
      this.logger.warn(
        `sharp preprocessing failed (sending original): ${err instanceof Error ? err.message : err}`,
      );
      return imageBuffer;
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
