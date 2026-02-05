import { Module } from '@nestjs/common';
import { BankAccountsController } from './controllers/bank-accounts.controller';
import { BankTransactionsController } from './controllers/bank-transactions.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { BankAccountsService } from './services/bank-accounts.service';
import { BankTransactionsService } from './services/bank-transactions.service';
import { ReconciliationService } from './services/reconciliation.service';
import { SalesModule } from '../sales/sales.module';
import { PurchasesModule } from '../purchases/purchases.module';

@Module({
  imports: [SalesModule, PurchasesModule],
  controllers: [BankAccountsController, BankTransactionsController, ReconciliationController],
  providers: [BankAccountsService, BankTransactionsService, ReconciliationService],
  exports: [BankAccountsService],
})
export class BankingModule {}
