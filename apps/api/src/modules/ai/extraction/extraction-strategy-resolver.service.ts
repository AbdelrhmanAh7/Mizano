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
import { RulesStrategy } from './rules-strategy.service';

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
  private readonly fastModel: string;
  private readonly slowModel: string;

  constructor(
    private configService: ConfigService,
    private vlmStrategy: VlmStrategy,
    private ocrLlmStrategy: OcrLlmStrategy,
    private hybridStrategy: HybridStrategy,
    private rulesStrategy: RulesStrategy,
  ) {
    this.defaultStrategy = this.configService.get<string>(
      'EXTRACTION_STRATEGY',
      'ocr',
    ) as ExtractionStrategyOption;
    this.fastModel = this.configService.get<string>('OLLAMA_FAST_MODEL', 'qwen2.5:7b');
    this.slowModel = this.configService.get<string>('OLLAMA_SLOW_MODEL', 'qwen3-vl:8b');
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
    // INTAKE_EXTRACTION_STRATEGY=rules|llm. Unset: LLM path, with the CPU rules
    // baseline when no model produced a result (Ollama unreachable or empty).
    const intakeMode = this.configService.get<string>('INTAKE_EXTRACTION_STRATEGY');
    const strategyName = (requested ||
      (intakeMode === 'rules' ? 'rules' : this.defaultStrategy)) as ExtractionStrategyOption;

    this.logger.log(
      `Resolving strategy: requested=${requested}, default=${this.defaultStrategy}, resolved=${strategyName}`,
    );

    if (strategyName === 'rules') {
      return this.rulesStrategy.extract(context);
    }

    if (intakeMode === 'llm') {
      return this.resolveLlm(context, strategyName);
    }

    try {
      const llmResult = await this.resolveLlm(context, strategyName);
      if (llmResult) return llmResult;
      this.logger.warn('LLM extraction returned nothing; using rules baseline');
    } catch (error) {
      this.logger.warn(
        `LLM extraction failed (${error instanceof Error ? error.name : 'unknown'}); using rules baseline`,
      );
    }
    return this.rulesStrategy.extract(context);
  }

  private async resolveLlm(
    context: ExtractionContext,
    strategyName: ExtractionStrategyOption,
  ): Promise<StrategyExtractionResult | null> {
    if (strategyName === 'auto') {
      return this.autoSelect(context);
    }

    // User-facing scan speed presets
    if (strategyName === 'fast') {
      this.logger.log(`Fast mode: PaddleOCR + ${this.fastModel}`);
      context.modelOverride = this.fastModel;
      return this.ocrLlmStrategy.extract(context);
    }
    if (strategyName === 'slow') {
      this.logger.log(`Slow mode: ${this.slowModel} vision model`);
      context.modelOverride = this.slowModel;
      if (this.vlmStrategy.canHandle(context)) {
        return this.vlmStrategy.extract(context);
      }
      // VLM can't handle PDFs — fall back to hybrid (OCR + VLM fallback)
      this.logger.warn('Slow mode: VLM cannot handle PDF, using hybrid');
      return this.hybridStrategy.extract(context);
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
      case 'rules':
        return this.rulesStrategy;
      default:
        return this.ocrLlmStrategy;
    }
  }
}
