import { Module } from '@nestjs/common';
import { LeadsService } from './services/leads.service';
import { DealsService } from './services/deals.service';
import { ActivitiesService } from './services/activities.service';
import { CrmController } from './controllers/crm.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmController],
  providers: [LeadsService, DealsService, ActivitiesService],
  exports: [LeadsService, DealsService, ActivitiesService],
})
export class CrmModule {}
