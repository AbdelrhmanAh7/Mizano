import { Module } from '@nestjs/common';
import { AiInsightsService } from './services/ai-insights.service';
import { AiForecastingService } from './services/ai-forecasting.service';
import { AiCategorizationService } from './services/ai-categorization.service';
import { AiController } from './controllers/ai.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiInsightsService, AiForecastingService, AiCategorizationService],
  exports: [AiInsightsService, AiForecastingService, AiCategorizationService],
})
export class AiModule {}
