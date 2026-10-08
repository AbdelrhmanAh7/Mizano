import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentClassificationService } from '../services/document-classification.service';
import { KnowledgeAssistantService } from '../services/knowledge-assistant.service';
import { describeError } from '../../../common/utils/redact';

const BATCH_SIZE = 5;

@Injectable()
export class AiNlpChatScheduler {
  private readonly logger = new Logger(AiNlpChatScheduler.name);
  private readonly enabled: boolean;

  constructor(
    private prisma: PrismaService,
    private docClassificationService: DocumentClassificationService,
    private knowledgeService: KnowledgeAssistantService,
    private config: ConfigService,
  ) {
    this.enabled = config.get('AI_SCHEDULERS_ENABLED') === 'true';
    if (!this.enabled) {
      this.logger.log(
        'AI_SCHEDULERS_ENABLED is not set to true; AI NLP/Chat schedulers are disabled',
      );
    }
  }

  private guard(): boolean {
    if (!this.enabled) {
      this.logger.debug('AI scheduler skipped (AI_SCHEDULERS_ENABLED != true)');
      return false;
    }
    return true;
  }

  /**
   * Periodic document classification retraining - runs every 6 hours
   */
  @Cron('30 */6 * * *', { name: 'ai:nlp:doc-classification-retraining' })
  async checkDocClassificationRetraining() {
    if (!this.guard()) return;
    this.logger.log('Running periodic document classification retraining...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              this.logger.log(`Org ${org.name}: Retraining document classifier...`);
              const result = await this.docClassificationService.trainModel(org.id);
              this.logger.log(
                `Org ${org.name}: Document classification model trained: v${result.version}, accuracy: ${(result.accuracy * 100).toFixed(1)}%, samples: ${result.sampleCount}`,
              );
            } catch (error) {
              this.logger.error(
                `Error retraining doc classification for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Document classification retraining completed');
    } catch (error) {
      this.logger.error(`Document classification retraining failed: ${describeError(error)}`);
    }
  }

  /**
   * Weekly knowledge index rebuild - runs every Saturday at 3 AM
   */
  @Cron('0 3 * * 6', { name: 'ai:nlp:weekly-knowledge-index-rebuild' })
  async runWeeklyKnowledgeIndexRebuild() {
    if (!this.guard()) return;
    this.logger.log('Starting weekly knowledge index rebuild...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
        const batch = organizations.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (org) => {
            try {
              const result = await this.knowledgeService.rebuildIndex(org.id);
              this.logger.log(
                `Org ${org.name}: Knowledge index rebuilt - ${result.indexed} documents indexed`,
              );
            } catch (error) {
              this.logger.error(
                `Error rebuilding knowledge index for org ${org.id}: ${describeError(error)}`,
              );
            }
          }),
        );
        // Log any unexpected rejections
        for (const r of results) {
          if (r.status === 'rejected') {
            this.logger.error(`Scheduler batch rejection: ${describeError(r.reason)}`);
          }
        }
      }

      this.logger.log('Weekly knowledge index rebuild completed');
    } catch (error) {
      this.logger.error(`Weekly knowledge index rebuild failed: ${describeError(error)}`);
    }
  }
}
