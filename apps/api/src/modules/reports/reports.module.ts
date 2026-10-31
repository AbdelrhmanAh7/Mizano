import { Module } from '@nestjs/common';
import { CacheModule } from '../../cache/cache.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { AiModule } from '../ai/ai.module';
import { TaxModule } from '../tax/tax.module';
import { ReportsController } from './controllers/reports.controller';
import { AgingReportsService } from './services/aging-reports.service';
import { DashboardService } from './services/dashboard.service';
import { FinancialReportsService } from './services/financial-reports.service';
import { ReportSummaryService } from './services/report-summary.service';
import { VatReturnDraftService } from './services/vat-return-draft.service';

@Module({
  imports: [PrismaModule, DocumentsModule, CacheModule, AiModule, TaxModule],
  controllers: [ReportsController],
  providers: [
    FinancialReportsService,
    AgingReportsService,
    DashboardService,
    VatReturnDraftService,
    ReportSummaryService,
  ],
  exports: [FinancialReportsService, AgingReportsService, DashboardService, VatReturnDraftService],
})
export class ReportsModule {}
