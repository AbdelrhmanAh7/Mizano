import { Module } from '@nestjs/common';
import { ItemsController } from './controllers/items.controller';
import { WarehousesController } from './controllers/warehouses.controller';
import { AdjustmentsController } from './controllers/adjustments.controller';
import { PriceListsController } from './controllers/price-lists.controller';
import { ItemsService } from './services/items.service';
import { WarehousesService } from './services/warehouses.service';
import { AdjustmentsService } from './services/adjustments.service';
import { PriceListsService } from './services/price-lists.service';

@Module({
  controllers: [ItemsController, WarehousesController, AdjustmentsController, PriceListsController],
  providers: [ItemsService, WarehousesService, AdjustmentsService, PriceListsService],
  exports: [ItemsService, WarehousesService],
})
export class InventoryModule {}
