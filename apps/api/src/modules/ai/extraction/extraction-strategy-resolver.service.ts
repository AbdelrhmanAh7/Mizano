import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeError } from '../../../common/utils/redact';
import { AiDocumentReader } from './ai-document-reader';
import { ExtractionContext, StrategyExtractionResult } from './extraction-strategy.interface';
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
    if (this.config.get<string>('INTAKE_EXTRACTION_STRATEGY') !== 'rules') {
      try {
        const read = await this.aiReader.read(organizationId, context);
        if (read) return read;
      } catch (error) {
        this.logger.warn(
          `AI reading failed (${describeError(error, { includeMessage: false })}); using the rules reader`,
        );
      }
    }
    return this.rulesStrategy.extract(context);
  }
}
