import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AiCoreModule } from '../core/ai-core.module';

// Security & Compliance Services
import { AuditRiskService } from '../services/audit-risk.service';
import { ComplianceMonitoringService } from '../services/compliance-monitoring.service';
import { FraudDetectionService } from '../services/fraud-detection.service';

// Security & Compliance Controllers
import { AuditRiskController } from '../controllers/audit-risk.controller';
import { ComplianceMonitoringController } from '../controllers/compliance-monitoring.controller';
import { FraudDetectionController } from '../controllers/fraud-detection.controller';

// Scheduler
import { AiSecurityScheduler } from '../schedulers/ai-security.scheduler';

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [FraudDetectionController, ComplianceMonitoringController, AuditRiskController],
  providers: [
    FraudDetectionService,
    ComplianceMonitoringService,
    AuditRiskService,
    AiSecurityScheduler,
  ],
  exports: [FraudDetectionService, ComplianceMonitoringService, AuditRiskService],
})
export class AiSecurityModule {}
