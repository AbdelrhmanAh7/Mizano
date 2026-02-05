import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { RolesModule } from './modules/roles/roles.module';
import { AuditModule } from './modules/audit/audit.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { BankingModule } from './modules/banking/banking.module';
import { HrModule } from './modules/hr/hr.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TaxModule } from './modules/tax/tax.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CrmModule } from './modules/crm/crm.module';
import { AiModule } from './modules/ai/ai.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    RolesModule,
    AuditModule,
    AccountingModule,
    SalesModule,
    PurchasesModule,
    InventoryModule,
    BankingModule,
    HrModule,
    ManufacturingModule,
    ProjectsModule,
    TaxModule,
    ReportsModule,
    CrmModule,
    AiModule,
    NotificationsModule,
  ],
})
export class AppModule {}
