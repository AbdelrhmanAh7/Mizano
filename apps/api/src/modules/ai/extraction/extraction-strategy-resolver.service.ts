import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiError } from '../account/ai-features';
import { describeError } from '../../../common/utils/redact';
import { AiDocumentReader } from './ai-document-reader';
import {
  ExtractionContext,
  ReaderFallbackReason,
  StrategyExtractionResult,
} from './extraction-strategy.interface';
import { RulesStrategy } from './rules-strategy.service';

/**
 * Chooses the reader for one document: the organization's own AI provider when its `documents`
 * feature is active (and `INTAKE_EXTRACTION_STRATEGY` is not `rules`), otherwise, or when the AI
 * reading fails, the CPU-only rules reader. The rules reader is not run when the AI answer is
 * valid, so a document costs one reading.
 */
@Injectable()
export class ExtractionStrategyResolver {
  private readonly logger = new Logger(ExtractionStrategyResolver.name);

  constructor(
    private readonly config: ConfigService,
    private readonly rulesStrategy: RulesStrategy,
    private readonly aiReader: AiDocumentReader,
  ) {}

  async resolve(
    organizationId: string,
    context: ExtractionContext,
  ): Promise<StrategyExtractionResult | null> {
    let fallbackReason: ReaderFallbackReason = 'RULES_ONLY';
    if (this.config.get<string>('INTAKE_EXTRACTION_STRATEGY') !== 'rules') {
      fallbackReason = 'AI_OFF';
      try {
        const read = await this.aiReader.read(organizationId, context);
        if (read) return read;
      } catch (error) {
        fallbackReason = error instanceof AiError ? error.code : 'AI_PROVIDER_ERROR';
        this.logger.warn(
          `AI reading failed (${describeError(error, { includeMessage: false })}); using the rules reader`,
        );
      }
    }
    const rules = await this.rulesStrategy.extract(context);
    return rules && { ...rules, fallbackReason };
  }
}
