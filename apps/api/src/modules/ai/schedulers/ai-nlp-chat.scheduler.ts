import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentClassificationService } from '../services/document-classification.service';
import { KnowledgeAssistantService } from '../services/knowledge-assistant.service';
import { forEachOrganization } from './for-each-organization';

@Injectable()
export class AiNlpChatScheduler {
  private readonly logger = new Logger(AiNlpChatScheduler.name);

  constructor(
    private prisma: PrismaService,
    private docClassificationService: DocumentClassificationService,
    private knowledgeService: KnowledgeAssistantService,
  ) {}

  /**
   * Periodic document classification retraining - runs every 6 hours
   */
  @Cron('30 */6 * * *')
  async checkDocClassificationRetraining() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'document classification retraining', failure: 'retraining doc classification' },
      async (org) => {
        this.logger.log(`Org ${org.name}: Retraining document classifier...`);
        const result = await this.docClassificationService.trainModel(org.id);
        this.logger.log(
          `Org ${org.name}: Document classification model trained: v${result.version}, accuracy: ${(result.accuracy * 100).toFixed(1)}%, samples: ${result.sampleCount}`,
        );
      },
    );
  }

  /**
   * Weekly knowledge index rebuild - runs every Saturday at 3 AM
   */
  @Cron('0 3 * * 6')
  async runWeeklyKnowledgeIndexRebuild() {
    await forEachOrganization(
      this.prisma,
      this.logger,
      { name: 'weekly knowledge index rebuild', failure: 'rebuilding knowledge index' },
      async (org) => {
        const result = await this.knowledgeService.rebuildIndex(org.id);
        this.logger.log(
          `Org ${org.name}: Knowledge index rebuilt - ${result.indexed} documents indexed`,
        );
      },
    );
  }
}
