import { Module } from '@nestjs/common';
import { CustomersController } from './controllers/customers.controller';
import { QuotesController } from './controllers/quotes.controller';
import { InvoicesController } from './controllers/invoices.controller';
import { CreditNotesController } from './controllers/credit-notes.controller';
import { PaymentsReceivedController } from './controllers/payments-received.controller';
import { CustomersService } from './services/customers.service';
import { QuotesService } from './services/quotes.service';
import { InvoicesService } from './services/invoices.service';
import { CreditNotesService } from './services/credit-notes.service';
import { PaymentsReceivedService } from './services/payments-received.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    CustomersController,
    QuotesController,
    InvoicesController,
    CreditNotesController,
    PaymentsReceivedController,
  ],
  providers: [
    CustomersService,
    QuotesService,
    InvoicesService,
    CreditNotesService,
    PaymentsReceivedService,
  ],
  exports: [CustomersService, InvoicesService],
})
export class SalesModule {}
