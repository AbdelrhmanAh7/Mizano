import { Module } from '@nestjs/common';
import { AccountsController } from './controllers/accounts.controller';
import { AccountingReportsController } from './controllers/accounting-reports.controller';
import { JournalsController } from './controllers/journals.controller';
import { OpeningBalancesController } from './controllers/opening-balances.controller';
import { RecurringProfilesController } from './controllers/recurring-profiles.controller';
import { AccountsService } from './services/accounts.service';
import { AccountingReportsService } from './services/accounting-reports.service';
import { JournalsService } from './services/journals.service';
import { OpeningBalancesService } from './services/opening-balances.service';
import { RecurringProfilesService } from './services/recurring-profiles.service';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [
    AccountsController,
    AccountingReportsController,
    JournalsController,
    OpeningBalancesController,
    RecurringProfilesController,
  ],
  providers: [
    AccountsService,
    AccountingReportsService,
    JournalsService,
    OpeningBalancesService,
    RecurringProfilesService,
  ],
  exports: [AccountsService, JournalsService],
})
export class AccountingModule {}
