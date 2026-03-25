import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractionStrategy,
  ExtractionContext,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { OllamaService } from '../services/ollama.service';

/**
 * VLM Strategy — sends image directly to Ollama vision model (minicpm-v).
 *
 * Lightweight fallback for when OCR fails. Not the primary path on CPU
 * because vision inference is slow (~60-180s).
 */
@Injectable()
export class VlmStrategy implements ExtractionStrategy {
  readonly name = 'vlm' as const;
  private readonly logger = new Logger(VlmStrategy.name);

  constructor(private readonly ollamaService: OllamaService) {}

  canHandle(context: ExtractionContext): boolean {
    // VLM can handle images directly; PDFs need image conversion
    return !context.isPdf;
  }

  async extract(context: ExtractionContext): Promise<StrategyExtractionResult | null> {
    const startTime = Date.now();

    this.logger.log(`VLM extraction: mime=${context.mimeType}, size=${context.fileBuffer.length}`);

    const extraction = await this.ollamaService.extractFromImageVision(
      context.fileBuffer,
      context.mimeType,
    );

    if (!extraction) {
      this.logger.warn('VLM extraction returned null');
      return null;
    }

    return {
      extraction,
      strategyUsed: 'vlm',
      totalTimeMs: Date.now() - startTime,
    };
  }
}
