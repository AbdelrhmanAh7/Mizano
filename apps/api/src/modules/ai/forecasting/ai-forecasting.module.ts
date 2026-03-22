import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';

// Forecasting Services
import { DemandForecastingService } from '../services/demand-forecasting.service';
import { CashFlowPredictionService } from '../services/cash-flow-prediction.service';
import { PaymentPredictionService } from '../services/payment-prediction.service';
import { PipelineForecastService } from '../services/pipeline-forecast.service';
import { FinancialNarrativeService } from '../services/financial-narrative.service';

// Forecasting Controllers
import { DemandForecastingController } from '../controllers/demand-forecasting.controller';
import { CashFlowPredictionController } from '../controllers/cash-flow-prediction.controller';
import { PaymentPredictionController } from '../controllers/payment-prediction.controller';
import { PipelineForecastController } from '../controllers/pipeline-forecast.controller';
import { NarrativeController } from '../controllers/narrative.controller';

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [
    DemandForecastingController,
    CashFlowPredictionController,
    PaymentPredictionController,
    PipelineForecastController,
    NarrativeController,
  ],
  providers: [
    DemandForecastingService,
    CashFlowPredictionService,
    PaymentPredictionService,
    PipelineForecastService,
    FinancialNarrativeService,
  ],
  exports: [
    DemandForecastingService,
    CashFlowPredictionService,
    PaymentPredictionService,
    PipelineForecastService,
    FinancialNarrativeService,
  ],
})
export class AiForecastingModule {}
