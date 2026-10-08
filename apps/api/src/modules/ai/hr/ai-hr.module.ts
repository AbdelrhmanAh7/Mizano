import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';

// HR & Operations Services
import { EmployeeAttritionService } from '../services/employee-attrition.service';
import { CompensationBenchmarkService } from '../services/compensation-benchmark.service';
import { SkillsGapService } from '../services/skills-gap.service';
import { WorkforceSchedulingService } from '../services/workforce-scheduling.service';
import { QualityPredictionService } from '../services/quality-prediction.service';
import { PredictiveMaintenanceService } from '../services/predictive-maintenance.service';
import { ResourceOptimizationService } from '../services/resource-optimization.service';
import { RouteOptimizationService } from '../services/route-optimization.service';

// HR & Operations Controllers
import { EmployeeAttritionController } from '../controllers/employee-attrition.controller';
import { CompensationBenchmarkController } from '../controllers/compensation-benchmark.controller';
import { SkillsGapController } from '../controllers/skills-gap.controller';
import { WorkforceSchedulingController } from '../controllers/workforce-scheduling.controller';
import { QualityPredictionController } from '../controllers/quality-prediction.controller';
import { PredictiveMaintenanceController } from '../controllers/predictive-maintenance.controller';
import { ResourceOptimizationController } from '../controllers/resource-optimization.controller';
import { RouteOptimizationController } from '../controllers/route-optimization.controller';

// Scheduler (registered only when AI_SCHEDULERS_ENABLED=true, see AC3 of #133)
import { AiHrOpsScheduler } from '../schedulers/ai-hr-ops.scheduler';
import { aiSchedulerProviders } from '../schedulers/ai-schedulers.enabled';

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [
    EmployeeAttritionController,
    CompensationBenchmarkController,
    SkillsGapController,
    WorkforceSchedulingController,
    QualityPredictionController,
    PredictiveMaintenanceController,
    ResourceOptimizationController,
    RouteOptimizationController,
  ],
  providers: [
    EmployeeAttritionService,
    CompensationBenchmarkService,
    SkillsGapService,
    WorkforceSchedulingService,
    QualityPredictionService,
    PredictiveMaintenanceService,
    ResourceOptimizationService,
    RouteOptimizationService,
    ...aiSchedulerProviders([AiHrOpsScheduler]),
  ],
  exports: [
    EmployeeAttritionService,
    CompensationBenchmarkService,
    SkillsGapService,
    WorkforceSchedulingService,
    QualityPredictionService,
    PredictiveMaintenanceService,
    ResourceOptimizationService,
    RouteOptimizationService,
  ],
})
export class AiHrModule {}
