import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

// Sub-modules
import { AiCoreModule } from './core/ai-core.module';
import { AiForecastingModule } from './forecasting/ai-forecasting.module';
import { AiHrModule } from './hr/ai-hr.module';
import { AiNlpModule } from './nlp/ai-nlp.module';
import { AiOperationsModule } from './operations/ai-operations.module';
import { AiSalesCrmModule } from './sales-crm/ai-sales-crm.module';
import { AiSecurityModule } from './security/ai-security.module';

// Cross-cutting services that span multiple sub-modules
import { AiCategorizationService } from './services/ai-categorization.service';
import { AiForecastingService } from './services/ai-forecasting.service';
import { DeepSearchService } from './services/deep-search.service';
import { TransactionCategorizerService } from './services/transaction-categorizer.service';

// Cross-cutting controllers
import { AiController } from './controllers/ai.controller';
import { CategorizationController } from './controllers/categorization.controller';
import { DeepSearchController } from './controllers/deep-search.controller';

// Cross-cutting operations scheduler
import { AiOperationsScheduler } from './schedulers/ai-operations.scheduler';
import { aiSchedulerProviders } from './schedulers/ai-schedulers.enabled';

@Module({
  imports: [
    PrismaModule,
    AiCoreModule,
    AiForecastingModule,
    AiSalesCrmModule,
    AiSecurityModule,
    AiNlpModule,
    AiOperationsModule,
    AiHrModule,
  ],
  controllers: [AiController, CategorizationController, DeepSearchController],
  providers: [
    // Legacy orchestration services
    AiCategorizationService,
    AiForecastingService,
    // Transaction categorizer uses services from core + operations
    TransactionCategorizerService,
    // DeepSearch is standalone
    DeepSearchService,
    // Cross-cutting operations scheduler (uses services from core, operations, forecasting, sales-crm)
    ...aiSchedulerProviders([AiOperationsScheduler]),
  ],
  exports: [
    // Re-export all sub-modules
    AiCoreModule,
    AiForecastingModule,
    AiSalesCrmModule,
    AiSecurityModule,
    AiNlpModule,
    AiOperationsModule,
    AiHrModule,
    // Cross-cutting services
    AiCategorizationService,
    AiForecastingService,
    TransactionCategorizerService,
    DeepSearchService,
  ],
})
export class AiModule {}
