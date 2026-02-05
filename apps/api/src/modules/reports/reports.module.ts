import { Module } from '@nestjs/common';
import { FinancialReportsService } from './services/financial-reports.service';
import { AgingReportsService } from './services/aging-reports.service';
import { DashboardService } from './services/dashboard.service';
import { ReportsController } from './controllers/reports.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [FinancialReportsService, AgingReportsService, DashboardService],
  exports: [FinancialReportsService, AgingReportsService, DashboardService],
})
export class ReportsModule {}
