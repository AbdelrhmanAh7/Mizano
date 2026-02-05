import { Module } from '@nestjs/common';
import { VendorsController } from './controllers/vendors.controller';
import { ExpensesController } from './controllers/expenses.controller';
import { BillsController } from './controllers/bills.controller';
import { PaymentsMadeController } from './controllers/payments-made.controller';
import { VendorsService } from './services/vendors.service';
import { ExpensesService } from './services/expenses.service';
import { BillsService } from './services/bills.service';
import { PaymentsMadeService } from './services/payments-made.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [VendorsController, ExpensesController, BillsController, PaymentsMadeController],
  providers: [VendorsService, ExpensesService, BillsService, PaymentsMadeService],
  exports: [VendorsService, BillsService],
})
export class PurchasesModule {}
