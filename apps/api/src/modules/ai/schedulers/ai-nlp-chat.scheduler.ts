import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { DocumentClassificationService } from '../services/document-classification.service';
import { ChatbotService } from '../services/chatbot.service';
import { KnowledgeAssistantService } from '../services/knowledge-assistant.service';

@Injectable()
export class AiNlpChatScheduler {
  private readonly logger = new Logger(AiNlpChatScheduler.name);

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private docClassificationService: DocumentClassificationService,
    private chatbotService: ChatbotService,
    private knowledgeService: KnowledgeAssistantService,
  ) {}

  /**
   * Check document classification retraining - runs every 6 hours
   */
  @Cron('30 */6 * * *')
  async checkDocClassificationRetraining() {
    this.logger.log('Checking document classification retraining...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const needsRetraining =
            await this.feedbackService.checkRetrainingThreshold(
              org.id,
              'DOCUMENT_CLASSIFICATION',
            );

          if (needsRetraining) {
            this.logger.log(
              `Org ${org.name}: Retraining document classifier...`,
            );
            const result = await this.docClassificationService.trainModel(
              org.id,
            );
            this.logger.log(
              `Org ${org.name}: Document classification model trained: v${result.version}, accuracy: ${(result.accuracy * 100).toFixed(1)}%, samples: ${result.sampleCount}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error checking doc classification retraining for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Document classification retraining check completed');
    } catch (error) {
      this.logger.error(
        `Document classification retraining check failed: ${error.message}`,
      );
    }
  }

  /**
   * Check chatbot retraining - runs every 6 hours
   */
  @Cron('15 */6 * * *')
  async checkChatbotRetraining() {
    this.logger.log('Checking chatbot retraining...');

    try {
      const organizations = await this.prisma.organization.findMany({
        where: {},
        select: { id: true, name: true },
      });

      for (const org of organizations) {
        try {
          const needsRetraining =
            await this.feedbackService.checkRetrainingThreshold(
              org.id,
              'CHATBOT',
            );

          if (needsRetraining) {
            this.logger.log(`Org ${org.name}: Retraining chatbot...`);
            const result = await this.chatbotService.trainClassifier(org.id);
            this.logger.log(
              `Org ${org.name}: Chatbot trained - trained: ${result.trained}, samples: ${result.sampleCount}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error checking chatbot retraining for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Chatbot retraining check completed');
    } catch (error) {
      this.logger.error(`Chatbot retraining check failed: ${error.message}`);
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
          this.logger.error(
            `Error rebuilding knowledge index for org ${org.id}: ${error.message}`,
          );
        }
      }

      this.logger.log('Weekly knowledge index rebuild completed');
    } catch (error) {
      this.logger.error(
        `Weekly knowledge index rebuild failed: ${error.message}`,
      );
    }
  }
}
