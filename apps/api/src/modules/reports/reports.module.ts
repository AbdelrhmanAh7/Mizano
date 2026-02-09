import { Module } from '@nestjs/common';
import { CacheModule } from '../../cache/cache.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { ReportsController } from './controllers/reports.controller';
import { AgingReportsService } from './services/aging-reports.service';
import { DashboardService } from './services/dashboard.service';
import { FinancialReportsService } from './services/financial-reports.service';

@Module({
  imports: [PrismaModule, DocumentsModule, CacheModule],
  controllers: [ReportsController],
  providers: [FinancialReportsService, AgingReportsService, DashboardService],
  exports: [FinancialReportsService, AgingReportsService, DashboardService],
})
export class ReportsModule {}
