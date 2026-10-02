import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BankAccountsController } from './controllers/bank-accounts.controller';
import { BankTransactionsController } from './controllers/bank-transactions.controller';
import { BankRulesController } from './controllers/bank-rules.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { BankAccountsService } from './services/bank-accounts.service';
import { BankTransactionsService } from './services/bank-transactions.service';
import { BankStatementImportService } from './services/bank-statement-import.service';
import { BankRulesService } from './services/bank-rules.service';
import { ReconciliationService } from './services/reconciliation.service';
import { AccountingModule } from '../accounting/accounting.module';
import { SalesModule } from '../sales/sales.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { ImportExportModule } from '../import-export/import-export.module';

@Module({
  imports: [
    AccountingModule,
    SalesModule,
    PurchasesModule,
    ImportExportModule,
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  ],
  controllers: [
    BankAccountsController,
    BankTransactionsController,
    BankRulesController,
    ReconciliationController,
  ],
  providers: [
    BankAccountsService,
    BankTransactionsService,
    BankStatementImportService,
    BankRulesService,
    ReconciliationService,
  ],
  exports: [BankAccountsService],
})
export class BankingModule {}
