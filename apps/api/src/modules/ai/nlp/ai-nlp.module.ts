import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';

// NLP & Chat Services
import { ChatbotService } from '../services/chatbot.service';
import { DocumentClassificationService } from '../services/document-classification.service';
import { EntityExtractionService } from '../services/entity-extraction.service';
import { SentimentAnalysisService } from '../services/sentiment-analysis.service';
import { ContractAnalysisService } from '../services/contract-analysis.service';
import { KnowledgeAssistantService } from '../services/knowledge-assistant.service';
import { VoiceCommandService } from '../services/voice-command.service';

// NLP & Chat Controllers
import { ChatbotController } from '../controllers/chatbot.controller';
import { DocumentClassificationController } from '../controllers/document-classification.controller';
import { EntityExtractionController } from '../controllers/entity-extraction.controller';
import { SentimentAnalysisController } from '../controllers/sentiment-analysis.controller';
import { ContractAnalysisController } from '../controllers/contract-analysis.controller';
import { KnowledgeAssistantController } from '../controllers/knowledge-assistant.controller';
import { VoiceCommandController } from '../controllers/voice-command.controller';

// Scheduler
import { AiNlpChatScheduler } from '../schedulers/ai-nlp-chat.scheduler';

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [
    ChatbotController,
    DocumentClassificationController,
    EntityExtractionController,
    SentimentAnalysisController,
    ContractAnalysisController,
    KnowledgeAssistantController,
    VoiceCommandController,
  ],
  providers: [
    ChatbotService,
    DocumentClassificationService,
    EntityExtractionService,
    SentimentAnalysisService,
    ContractAnalysisService,
    KnowledgeAssistantService,
    VoiceCommandService,
    AiNlpChatScheduler,
  ],
  exports: [
    ChatbotService,
    DocumentClassificationService,
    EntityExtractionService,
    SentimentAnalysisService,
    ContractAnalysisService,
    KnowledgeAssistantService,
    VoiceCommandService,
  ],
})
export class AiNlpModule {}
