import { Module } from '@nestjs/common';
import { TaxRatesService } from './services/tax-rates.service';
import { VatReturnsService } from './services/vat-returns.service';
import { TaxRatesController } from './controllers/tax-rates.controller';
import { VatReturnsController } from './controllers/vat-returns.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [TaxRatesController, VatReturnsController],
  providers: [TaxRatesService, VatReturnsService],
  exports: [TaxRatesService, VatReturnsService],
})
export class TaxModule {}
