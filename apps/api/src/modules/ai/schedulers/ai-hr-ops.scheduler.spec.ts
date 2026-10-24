import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmployeeAttritionService } from '../services/employee-attrition.service';
import { CompensationBenchmarkService } from '../services/compensation-benchmark.service';
import { QualityPredictionService } from '../services/quality-prediction.service';
import { PredictiveMaintenanceService } from '../services/predictive-maintenance.service';
import { ResourceOptimizationService } from '../services/resource-optimization.service';
import { AiHrOpsScheduler, aiHrOpsSchedulerProvider } from './ai-hr-ops.scheduler';

async function resolveScheduler(flag: string | undefined): Promise<unknown> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      aiHrOpsSchedulerProvider,
      { provide: ConfigService, useValue: { get: () => flag } },
      { provide: PrismaService, useValue: {} },
      { provide: EmployeeAttritionService, useValue: {} },
      { provide: CompensationBenchmarkService, useValue: {} },
      { provide: QualityPredictionService, useValue: {} },
      { provide: PredictiveMaintenanceService, useValue: {} },
      { provide: ResourceOptimizationService, useValue: {} },
    ],
  }).compile();
  return moduleRef.get(AiHrOpsScheduler);
}

describe('aiHrOpsSchedulerProvider', () => {
  it.each([undefined, 'false', ''])(
    'does not instantiate the scheduler when AI_SCHEDULERS_ENABLED=%p',
    async (flag) => {
      const resolved = await resolveScheduler(flag);
      expect(resolved).not.toBeInstanceOf(AiHrOpsScheduler);
      // inert: plain empty object, no cron handlers, so @nestjs/schedule finds nothing to register
      expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype);
      expect(Object.keys(resolved as object)).toEqual([]);
      expect(resolved).not.toHaveProperty('runMonthlyAttritionPrediction');
    },
  );

  it('instantiates the scheduler when AI_SCHEDULERS_ENABLED=true', async () => {
    expect(await resolveScheduler('true')).toBeInstanceOf(AiHrOpsScheduler);
  });
});
