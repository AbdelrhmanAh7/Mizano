import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExtractionStrategy,
  ExtractionContext,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { OcrLlmStrategy } from './ocr-llm-strategy.service';
import { VlmStrategy } from './vlm-strategy.service';

/**
 * Hybrid Strategy — OCR first, VLM fallback if OCR confidence is too low.
 *
 * Best balance of speed and quality:
 * - PDF with native text → text model directly (fastest)
 * - Images → PaddleOCR → if confidence ≥ threshold: text model (fast path)
 *                       → if confidence < threshold: VLM fallback (slow path)
 */
@Injectable()
export class HybridStrategy implements ExtractionStrategy {
  readonly name = 'hybrid' as const;
  private readonly logger = new Logger(HybridStrategy.name);
  private readonly confidenceThreshold: number;

  constructor(
    private readonly ocrLlmStrategy: OcrLlmStrategy,
    private readonly vlmStrategy: VlmStrategy,
    private configService: ConfigService,
  ) {
    this.confidenceThreshold = parseInt(
      this.configService.get('EXTRACTION_OCR_CONFIDENCE_THRESHOLD', '70'),
      10,
    );
  }

  canHandle(_context: ExtractionContext): boolean {
    return true;
  }

  async extract(context: ExtractionContext): Promise<StrategyExtractionResult | null> {
    const startTime = Date.now();

    // Fast path: PDF with native text → skip OCR entirely
    if (context.isPdf && context.pdfIsNativeText && context.pdfText) {
      this.logger.log('Hybrid: PDF with native text → OCR-LLM fast path');
      const result = await this.ocrLlmStrategy.extract(context);
      if (result) {
        return {
          ...result,
          strategyUsed: 'hybrid',
          subPathUsed: 'ocr-fast',
          totalTimeMs: Date.now() - startTime,
        };
      }
    }

    // Try OCR first
    this.logger.log('Hybrid: trying OCR first...');
    const ocrResult = await this.ocrLlmStrategy.extract(context);

    if (ocrResult && ocrResult.ocrRawConfidence != null) {
      if (ocrResult.ocrRawConfidence >= this.confidenceThreshold) {
        this.logger.log(
          `Hybrid: OCR confidence ${ocrResult.ocrRawConfidence.toFixed(1)}% >= ${this.confidenceThreshold}% → using OCR result`,
        );
        return {
          ...ocrResult,
          strategyUsed: 'hybrid',
          subPathUsed: 'ocr-fast',
          totalTimeMs: Date.now() - startTime,
        };
      }

      this.logger.log(
        `Hybrid: OCR confidence ${ocrResult.ocrRawConfidence.toFixed(1)}% < ${this.confidenceThreshold}% → falling back to VLM`,
      );
    } else if (ocrResult) {
      // OCR succeeded but no confidence reported (native PDF text) — use it
      return {
        ...ocrResult,
        strategyUsed: 'hybrid',
        subPathUsed: 'ocr-fast',
        totalTimeMs: Date.now() - startTime,
      };
    }

    // VLM fallback (only for images — VLM can't handle PDFs directly)
    if (!context.isPdf && this.vlmStrategy.canHandle(context)) {
      this.logger.log('Hybrid: VLM fallback for image');
      const vlmResult = await this.vlmStrategy.extract(context);
      if (vlmResult) {
        return {
          ...vlmResult,
          strategyUsed: 'hybrid',
          subPathUsed: 'vlm-fallback',
          totalTimeMs: Date.now() - startTime,
        };
      }
    }

    // Last resort: return whatever OCR gave us (even with low confidence)
    if (ocrResult) {
      this.logger.warn('Hybrid: VLM fallback failed, returning low-confidence OCR result');
      return {
        ...ocrResult,
        strategyUsed: 'hybrid',
        subPathUsed: 'ocr-fast',
        totalTimeMs: Date.now() - startTime,
      };
    }

    this.logger.warn('Hybrid: all strategies failed');
    return null;
  }
}
