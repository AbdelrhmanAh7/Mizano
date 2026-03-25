import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExtractionContext,
  ExtractionStrategy,
  ExtractionStrategyOption,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { VlmStrategy } from './vlm-strategy.service';
import { OcrLlmStrategy } from './ocr-llm-strategy.service';
import { HybridStrategy } from './hybrid-strategy.service';

/**
 * Resolves and executes the appropriate extraction strategy.
 *
 * Strategy selection:
 * - Explicit strategy from request or env → use that one
 * - 'auto' → smart routing based on document characteristics
 * - Fallback → ocr-llm (best CPU performance)
 */
@Injectable()
export class ExtractionStrategyResolver {
  private readonly logger = new Logger(ExtractionStrategyResolver.name);
  private readonly defaultStrategy: ExtractionStrategyOption;

  constructor(
    private configService: ConfigService,
    private vlmStrategy: VlmStrategy,
    private ocrLlmStrategy: OcrLlmStrategy,
    private hybridStrategy: HybridStrategy,
  ) {
    this.defaultStrategy = this.configService.get<string>(
      'EXTRACTION_STRATEGY',
      'ocr',
    ) as ExtractionStrategyOption;
  }

  /**
   * Resolve and execute the best extraction strategy for the given context.
   *
   * @param context   Document context (buffer, type, PDF text, etc.)
   * @param requested Optional per-request strategy override
   */
  async resolve(
    context: ExtractionContext,
    requested?: string,
  ): Promise<StrategyExtractionResult | null> {
    const strategyName = (requested || this.defaultStrategy) as ExtractionStrategyOption;

    this.logger.log(
      `Resolving strategy: requested=${requested}, default=${this.defaultStrategy}, resolved=${strategyName}`,
    );

    if (strategyName === 'auto') {
      return this.autoSelect(context);
    }

    const strategy = this.getStrategy(strategyName);

    if (!strategy.canHandle(context)) {
      this.logger.warn(
        `Strategy ${strategyName} cannot handle this document, falling back to ocr-llm`,
      );
      return this.ocrLlmStrategy.extract(context);
    }

    return strategy.extract(context);
  }

  /**
   * Auto mode: smart routing based on document characteristics.
   */
  private autoSelect(context: ExtractionContext): Promise<StrategyExtractionResult | null> {
    // PDF with native text → ocr-llm (fastest, skip OCR, just use text model)
    if (context.isPdf && context.pdfIsNativeText) {
      this.logger.log('Auto: PDF with native text → ocr-llm');
      return this.ocrLlmStrategy.extract(context);
    }

    // Images and scanned PDFs → hybrid (OCR + VLM fallback)
    this.logger.log('Auto: image/scanned PDF → hybrid');
    return this.hybridStrategy.extract(context);
  }

  private getStrategy(name: ExtractionStrategyOption): ExtractionStrategy {
    switch (name) {
      case 'vlm':
        return this.vlmStrategy;
      case 'ocr-llm':
      case 'ocr' as ExtractionStrategyOption:
        return this.ocrLlmStrategy;
      case 'hybrid':
        return this.hybridStrategy;
      default:
        return this.ocrLlmStrategy;
    }
  }
}
