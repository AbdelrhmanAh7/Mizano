import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';

// Core Infrastructure Services
import { AiAlertsService } from '../services/ai-alerts.service';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { AiInsightsService } from '../services/ai-insights.service';
import { AiTrainingDataGeneratorService } from '../services/ai-training-data-generator.service';
import { AiTrainingService } from '../services/ai-training.service';
import { ModelRegistryService } from '../services/model-registry.service';

// Core Controllers
import { AiAlertsController } from '../controllers/ai-alerts.controller';
import { AiFeedbackController } from '../controllers/ai-feedback.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AiFeedbackController, AiAlertsController],
  providers: [
    ModelRegistryService,
    AiTrainingService,
    AiFeedbackService,
    AiInsightsService,
    AiAlertsService,
    AiTrainingDataGeneratorService,
  ],
  exports: [
    ModelRegistryService,
    AiTrainingService,
    AiFeedbackService,
    AiInsightsService,
    AiAlertsService,
    AiTrainingDataGeneratorService,
  ],
})
export class AiCoreModule {}
