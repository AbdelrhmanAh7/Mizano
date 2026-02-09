import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PerformanceController } from './performance.controller';
import { IndexAdvisorService } from './services/index-advisor.service';
import { QueryMetricsService } from './services/query-metrics.service';

@Module({
  imports: [PrismaModule],
  controllers: [PerformanceController],
  providers: [QueryMetricsService, IndexAdvisorService],
  exports: [QueryMetricsService],
})
export class PerformanceModule {}
