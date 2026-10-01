import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractionStrategy,
  ExtractionContext,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { OllamaService } from '../services/ollama.service';
import { PaddleOcrService } from '../services/paddle-ocr.service';
import { preprocessForOcr } from '../utils/image-preprocessor.util';
import { describeError } from '../../../common/utils/redact';

/**
 * OCR + LLM Strategy — OCR reads the document, then text model structures it.
 *
 * OCR priority:
 *  1. PaddleOCR via Python subprocess (same quality as aistudio.baidu.com)
 *  2. Tesseract.js (fallback)
 */
@Injectable()
export class OcrLlmStrategy implements ExtractionStrategy {
  readonly name = 'ocr-llm' as const;
  private readonly logger = new Logger(OcrLlmStrategy.name);
  private tesseractWorker: unknown | null = null;

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly paddleOcrService: PaddleOcrService,
  ) {}

  canHandle(_context: ExtractionContext): boolean {
    // OCR+LLM can handle images and PDFs (with native text or via OCR)
    return true;
  }

  async extract(context: ExtractionContext): Promise<StrategyExtractionResult | null> {
    const startTime = Date.now();
    let ocrText = '';
    let ocrConfidence = 0;

    // For PDFs with native text, skip OCR and use the already-extracted text
    if (context.isPdf && context.pdfIsNativeText && context.pdfText) {
      this.logger.log('Using native PDF text (skipping OCR)');
      ocrText = context.pdfText;
      ocrConfidence = 95; // Native text is highly reliable
    } else if (context.isPdf && !context.pdfIsNativeText) {
      // Scanned PDF — convert pages to images and OCR via PaddleOCR
      this.logger.log('[STEP 2] Scanned PDF detected — running PaddleOCR on PDF pages...');
      const paddleAvailable = await this.paddleOcrService.isAvailable();

      if (paddleAvailable && this.paddleOcrService.canRenderPdf()) {
        const ocrResult = await this.paddleOcrService.recognize(context.fileBuffer, true);
        ocrText = ocrResult.text;
        ocrConfidence = ocrResult.confidence;
        this.logger.log(
          `[STEP 2] PaddleOCR PDF result: regions=${ocrResult.regions.length}, ` +
            `confidence=${ocrConfidence}%, time=${ocrResult.processingTimeMs}ms`,
        );
      }

      // Fallback: use whatever sparse text pdf-parse extracted
      if (
        (!ocrText || ocrText.trim().length < 10) &&
        context.pdfText &&
        context.pdfText.length > 20
      ) {
        this.logger.warn('[STEP 2] PaddleOCR PDF failed — using sparse pdf-parse text');
        ocrText = context.pdfText;
        ocrConfidence = 30;
      }

      if (!ocrText || ocrText.trim().length < 10) {
        this.logger.warn('[STEP 2] Scanned PDF — no text could be extracted');
        return null;
      }
    } else {
      // Image file — run OCR: PaddleOCR Python → Tesseract.js fallback

      // Priority 1: PaddleOCR via Python (same quality as aistudio.baidu.com)
      const paddleAvailable = await this.paddleOcrService.isAvailable();
      this.logger.log(`[STEP 2] PaddleOCR Python available: ${paddleAvailable}`);

      if (paddleAvailable) {
        this.logger.log('[STEP 2] Running PaddleOCR Python...');
        const ocrResult = await this.paddleOcrService.recognize(context.fileBuffer);
        ocrText = ocrResult.text;
        ocrConfidence = ocrResult.confidence;
        this.logger.log(
          `[STEP 2] PaddleOCR result: regions=${ocrResult.regions.length}, confidence=${ocrConfidence}%, time=${ocrResult.processingTimeMs}ms`,
        );
      }

      // Fallback: Tesseract.js
      if (!ocrText || ocrText.trim().length < 10) {
        this.logger.log('[STEP 2] Falling back to Tesseract.js');
        let processedBuffer: Buffer;
        try {
          processedBuffer = await preprocessForOcr(context.fileBuffer, context.mimeType);
        } catch {
          processedBuffer = context.fileBuffer;
        }
        try {
          const tessResult = await this.runTesseract(processedBuffer, context.language);
          ocrText = tessResult.text;
          ocrConfidence = tessResult.confidence;
          this.logger.log(
            `[STEP 2] Tesseract.js result: textLen=${ocrText.length}, confidence=${ocrConfidence.toFixed(1)}%`,
          );
        } catch (err) {
          this.logger.error(`[STEP 2] Tesseract.js OCR failed: ${describeError(err)}`);
        }
      }

      if (!ocrText || ocrText.trim().length < 10) {
        this.logger.warn('[STEP 2] All OCR engines returned insufficient text');
        return null;
      }
    }

    // Only metadata is logged: OCR text is document content and must never reach logs.
    this.logger.log(
      `[STEP 3] OCR text ready (${ocrText.length} chars, confidence=${ocrConfidence.toFixed(1)}%)`,
    );

    // Truncate long text (same limit as PDF pipeline)
    const maxLen = 4000;
    if (ocrText.length > maxLen) {
      this.logger.log(`[STEP 3] Truncating from ${ocrText.length} to ${maxLen} chars`);
      ocrText = ocrText.slice(0, maxLen);
    }

    // Pass OCR text to Ollama text model for structured extraction
    const modelLabel = context.modelOverride || 'default';
    this.logger.log(`[STEP 4] Sending OCR text to Ollama (${modelLabel}) for JSON extraction...`);
    const extraction = await this.ollamaService.extractFromOcrText(
      ocrText,
      ocrConfidence,
      context.modelOverride,
    );

    if (!extraction) {
      this.logger.warn('[STEP 4] Ollama text extraction returned null');
      return null;
    }

    // Counters and timings only: vendor names, amounts, tax ids and line descriptions are
    // invoice content and must not be logged.
    this.logger.log(
      `[STEP 5] Extraction result: category=${extraction.documentCategory ?? 'none'}, ` +
        `lineItems=${extraction.lineItems.length}, processingTimeMs=${extraction.processingTimeMs}ms`,
    );

    return {
      extraction,
      strategyUsed: 'ocr-llm',
      ocrRawConfidence: ocrConfidence,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Run Tesseract.js OCR as fallback when PaddleOCR is unavailable.
   * Lazy-initializes the worker on first call.
   */
  private async runTesseract(
    imageBuffer: Buffer,
    language: string,
  ): Promise<{ text: string; confidence: number }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Tesseract = require('tesseract.js');

    if (!this.tesseractWorker) {
      // Map language codes: 'ara+en' → 'ara+eng'
      const tessLang = language.replace(/\ben\b/g, 'eng').replace(/\bar\b/g, 'ara');
      this.tesseractWorker = await Tesseract.createWorker(tessLang);
    }

    const worker = this.tesseractWorker as {
      recognize(buffer: Buffer): Promise<{ data: { text: string; confidence: number } }>;
    };

    const result = await worker.recognize(imageBuffer);
    return {
      text: result.data.text || '',
      confidence: result.data.confidence || 0,
    };
  }
}
