import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Worker } from 'tesseract.js';
import {
  ExtractionStrategy,
  ExtractionContext,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { OllamaService } from '../services/ollama.service';
import { PaddleOcrService } from '../services/paddle-ocr.service';
import { preprocessForOcr } from '../utils/image-preprocessor.util';
import { describeError } from '../../../common/utils/redact';
import { createOfflineTesseractWorker } from './offline-tesseract';

/**
 * OCR + LLM Strategy — OCR reads the document, then text model structures it.
 *
 * OCR priority:
 *  1. PaddleOCR via Python subprocess (same quality as aistudio.baidu.com)
 *  2. Tesseract.js (fallback)
 */
@Injectable()
export class OcrLlmStrategy implements ExtractionStrategy, OnModuleDestroy {
  readonly name = 'ocr-llm' as const;
  private readonly logger = new Logger(OcrLlmStrategy.name);
  private tesseractWorker: Worker | null = null;
  private tesseractQueue: Promise<void> = Promise.resolve();
  private closing = false;

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
    if (context.isPdf && context.pdfText && context.pdfIsNativeText) {
      this.logger.log(
        `[STEP 1] Skipping OCR: PDF has native text (${context.pdfText.length} chars)`,
      );
      ocrText = context.pdfText;
      ocrConfidence = 95;
    } else {
      // Step 1: Try PaddleOCR (primary engine for both Arabic and English)
      if (await this.paddleOcrService.isAvailable()) {
        this.logger.log('[STEP 1] Running PaddleOCR...');
        try {
          const paddleResult = await this.paddleOcrService.recognize(
            context.fileBuffer,
            context.isPdf,
          );
          ocrText = paddleResult.text;
          ocrConfidence = paddleResult.confidence;
          this.logger.log(
            `[STEP 1] PaddleOCR result: textLen=${ocrText.length}, confidence=${ocrConfidence.toFixed(1)}%`,
          );
        } catch (err) {
          this.logger.warn(`[STEP 1] PaddleOCR failed, falling back to Tesseract: ${err}`);
        }
      } else {
        this.logger.log('[STEP 1] PaddleOCR not available, using Tesseract.js fallback');
      }

      // Step 2: Fallback to Tesseract.js if PaddleOCR didn't produce text
      if (!ocrText || ocrText.trim().length < 10) {
        this.logger.log('[STEP 2] Running Tesseract.js fallback...');
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
          this.logger.error(
            `[STEP 2] Tesseract.js OCR failed: ${describeError(err, { includeMessage: false })}`,
          );
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
    this.logger.log('[STEP 4] Sending OCR text to the configured Ollama model for JSON extraction');
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
      `[STEP 5] Extraction result: lineItems=${extraction.lineItems.length}, ` +
        `processingTimeMs=${extraction.processingTimeMs}ms`,
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
  private runTesseract(
    imageBuffer: Buffer,
    language: string,
  ): Promise<{ text: string; confidence: number }> {
    if (this.closing) {
      return Promise.reject(new Error('OCR worker is shutting down'));
    }
    const normalized = language.replace(/\ben\b/g, 'eng').replace(/\bar\b/g, 'ara');
    if (!normalized.split('+').every((code) => code === 'eng' || code === 'ara')) {
      return Promise.reject(new Error('Unsupported offline OCR language'));
    }
    // A single FIFO covers initialization AND recognition, including concurrent
    // first requests. Both pinned languages stay loaded across language changes.
    const task = this.tesseractQueue.then(async () => {
      this.tesseractWorker ??= await createOfflineTesseractWorker();
      try {
        const result = await this.tesseractWorker.recognize(imageBuffer);
        return { text: result.data.text || '', confidence: result.data.confidence || 0 };
      } catch (error) {
        await this.terminateTesseract();
        throw error;
      }
    });
    this.tesseractQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    await this.tesseractQueue;
    await this.terminateTesseract();
  }

  private async terminateTesseract(): Promise<void> {
    const worker = this.tesseractWorker;
    this.tesseractWorker = null;
    if (worker) {
      try {
        await worker.terminate();
      } catch (error) {
        this.logger.error(
          `OCR shutdown failed: ${describeError(error, { includeMessage: false })}`,
        );
      }
    }
  }
}
