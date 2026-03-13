import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';

// Core Infrastructure Services
import { AiAlertsService } from '../services/ai-alerts.service';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { AiInsightsService } from '../services/ai-insights.service';

// Ollama inference
import { OllamaInferenceGateway } from '../services/ollama-inference-gateway.service';

// Core Controllers
import { AiAlertsController } from '../controllers/ai-alerts.controller';
import { AiFeedbackController } from '../controllers/ai-feedback.controller';

@Module({
  imports: [PrismaModule, HttpModule, ConfigModule],
  controllers: [AiFeedbackController, AiAlertsController],
  providers: [AiFeedbackService, AiInsightsService, AiAlertsService, OllamaInferenceGateway],
  exports: [AiFeedbackService, AiInsightsService, AiAlertsService, OllamaInferenceGateway],
})
export class AiCoreModule {}
