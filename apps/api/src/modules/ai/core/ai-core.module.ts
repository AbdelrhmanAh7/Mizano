import * as http from 'http';
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

// AI Cache
import { AiCacheService } from '../services/ai-cache.service';

// Core Controllers
import { AiAlertsController } from '../controllers/ai-alerts.controller';
import { AiFeedbackController } from '../controllers/ai-feedback.controller';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 300_000, // 5 min max — vision inference can be slow
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
    }),
    ConfigModule,
  ],
  controllers: [AiFeedbackController, AiAlertsController],
  providers: [
    AiFeedbackService,
    AiInsightsService,
    AiAlertsService,
    OllamaInferenceGateway,
    AiCacheService,
  ],
  exports: [
    AiFeedbackService,
    AiInsightsService,
    AiAlertsService,
    OllamaInferenceGateway,
    AiCacheService,
  ],
})
export class AiCoreModule {}
