import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentClassificationService } from '../services/document-classification.service';
import { KnowledgeAssistantService } from '../services/knowledge-assistant.service';

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
    this.logger.log('Running periodic document classification retraining...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          this.logger.log(`Org ${org.name}: Retraining document classifier...`);
          const result = await this.docClassificationService.trainModel(org.id);
          this.logger.log(
            `Org ${org.name}: Document classification model trained: v${result.version}, accuracy: ${(result.accuracy * 100).toFixed(1)}%, samples: ${result.sampleCount}`,
          );
        } catch (error) {
          this.logger.error(
            `Error retraining doc classification for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Document classification retraining completed');
    } catch (error) {
      this.logger.error(`Document classification retraining failed: ${error.message}`);
    }
  }

  /**
   * Weekly knowledge index rebuild - runs every Saturday at 3 AM
   */
  @Cron('0 3 * * 6')
  async runWeeklyKnowledgeIndexRebuild() {
    this.logger.log('Starting weekly knowledge index rebuild...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const result = await this.knowledgeService.rebuildIndex(org.id);
          this.logger.log(
            `Org ${org.name}: Knowledge index rebuilt - ${result.indexed} documents indexed`,
          );
        } catch (error) {
          this.logger.error(`Error rebuilding knowledge index for org ${org.id}: ${error.message}`);
        }
      }

      this.logger.log('Weekly knowledge index rebuild completed');
    } catch (error) {
      this.logger.error(`Weekly knowledge index rebuild failed: ${error.message}`);
    }
  }
}
