import { Module } from '@nestjs/common';
import { AccountsController } from './controllers/accounts.controller';
import { AccountingReportsController } from './controllers/accounting-reports.controller';
import { JournalsController } from './controllers/journals.controller';
import { RecurringProfilesController } from './controllers/recurring-profiles.controller';
import { AccountsService } from './services/accounts.service';
import { AccountingReportsService } from './services/accounting-reports.service';
import { JournalsService } from './services/journals.service';
import { RecurringProfilesService } from './services/recurring-profiles.service';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [
    AccountsController,
    AccountingReportsController,
    JournalsController,
    RecurringProfilesController,
  ],
  providers: [AccountsService, AccountingReportsService, JournalsService, RecurringProfilesService],
  exports: [AccountsService, JournalsService],
})
export class AccountingModule {}
