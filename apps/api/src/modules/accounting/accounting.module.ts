import { Module } from '@nestjs/common';
import { AccountsController } from './controllers/accounts.controller';
import { JournalsController } from './controllers/journals.controller';
import { RecurringProfilesController } from './controllers/recurring-profiles.controller';
import { AccountsService } from './services/accounts.service';
import { JournalsService } from './services/journals.service';
import { RecurringProfilesService } from './services/recurring-profiles.service';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [AccountsController, JournalsController, RecurringProfilesController],
  providers: [AccountsService, JournalsService, RecurringProfilesService],
  exports: [AccountsService, JournalsService],
})
export class AccountingModule {}
