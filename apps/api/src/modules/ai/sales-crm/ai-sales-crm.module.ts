import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';
import { AiForecastingModule } from '../forecasting/ai-forecasting.module';

// Sales & CRM Services
import { ChurnPredictionService } from '../services/churn-prediction.service';
import { ClvAnalysisService } from '../services/clv-analysis.service';
import { CrossSellService } from '../services/cross-sell.service';
import { DynamicPricingService } from '../services/dynamic-pricing.service';
import { LeadScoringService } from '../services/lead-scoring.service';

// Sales & CRM Controllers
import { ChurnPredictionController } from '../controllers/churn-prediction.controller';
import { ClvAnalysisController } from '../controllers/clv-analysis.controller';
import { CrossSellController } from '../controllers/cross-sell.controller';
import { DynamicPricingController } from '../controllers/dynamic-pricing.controller';
import { LeadScoringController } from '../controllers/lead-scoring.controller';

// Scheduler (registered only when AI_SCHEDULERS_ENABLED=true, see AC3 of #133)
import { AiSalesCrmScheduler } from '../schedulers/ai-sales-crm.scheduler';
import { aiSchedulerProviders } from '../schedulers/ai-schedulers.enabled';

@Module({
  imports: [PrismaModule, AiCoreModule, AiForecastingModule],
  controllers: [
    LeadScoringController,
    ChurnPredictionController,
    ClvAnalysisController,
    CrossSellController,
    DynamicPricingController,
  ],
  providers: [
    LeadScoringService,
    ChurnPredictionService,
    ClvAnalysisService,
    CrossSellService,
    DynamicPricingService,
    ...aiSchedulerProviders([AiSalesCrmScheduler]),
  ],
  exports: [
    LeadScoringService,
    ChurnPredictionService,
    ClvAnalysisService,
    CrossSellService,
    DynamicPricingService,
  ],
})
export class AiSalesCrmModule {}
