import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import {
  I18nModule,
  AcceptLanguageResolver,
  HeaderResolver,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
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
import { DocumentsModule } from './modules/documents/documents.module';
import { ImportExportModule } from './modules/import-export/import-export.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { AssetsModule } from './modules/assets/assets.module';
import { HealthModule } from './health/health.module';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '..', 'i18n'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        { use: HeaderResolver, options: ['x-lang', 'accept-language'] },
        AcceptLanguageResolver,
      ],
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
    DocumentsModule,
    ImportExportModule,
    CurrencyModule,
    AssetsModule,
    HealthModule,
    CacheModule,
  ],
})
export class AppModule {}
