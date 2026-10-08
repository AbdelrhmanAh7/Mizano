import { Module } from '@nestjs/common';
import { BomService } from './services/bom.service';
import { WorkOrdersService } from './services/work-orders.service';
import { BomController } from './controllers/bom.controller';
import { WorkOrdersController } from './controllers/work-orders.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [BomController, WorkOrdersController],
  providers: [BomService, WorkOrdersService],
  exports: [BomService, WorkOrdersService],
})
export class ManufacturingModule {}
