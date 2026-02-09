import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import * as path from 'path';
import { CacheModule } from './cache/cache.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { CacheResponseInterceptor } from './common/interceptors/cache-response.interceptor';
import { HealthModule } from './health/health.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AiModule } from './modules/ai/ai.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BankingModule } from './modules/banking/banking.module';
import { BulkOperationsModule } from './modules/bulk-operations/bulk-operations.module';
import { CrmModule } from './modules/crm/crm.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HrModule } from './modules/hr/hr.module';
import { ImportExportModule } from './modules/import-export/import-export.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LoggerModule } from './modules/logger/logger.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SalesModule } from './modules/sales/sales.module';
import { SearchModule } from './modules/search/search.module';
import { TaxModule } from './modules/tax/tax.module';
import { UserPreferencesModule } from './modules/user-preferences/user-preferences.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'short',
          ttl: config.get('RATE_LIMIT_TTL', 1000),
          limit: config.get('RATE_LIMIT_MAX', 30),
        },
        {
          name: 'long',
          ttl: 60000,
          limit: config.get('RATE_LIMIT_AUTH_MAX', 100),
        },
      ],
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '..', 'i18n'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        { use: HeaderResolver, options: ['x-lang'] },
        AcceptLanguageResolver,
      ],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
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
    UserPreferencesModule,
    HealthModule,
    CacheModule,
    LoggerModule,
    SearchModule,
    PerformanceModule,
    BulkOperationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheResponseInterceptor,
    },
  ],
})
export class AppModule {}
