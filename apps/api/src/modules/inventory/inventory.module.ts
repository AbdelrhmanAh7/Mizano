import { Module } from '@nestjs/common';
import { ItemsController } from './controllers/items.controller';
import { WarehousesController } from './controllers/warehouses.controller';
import { AdjustmentsController } from './controllers/adjustments.controller';
import { PriceListsController } from './controllers/price-lists.controller';
import { CompositeItemsController } from './controllers/composite-items.controller';
import { TransfersController } from './controllers/transfers.controller';
import { ItemsService } from './services/items.service';
import { WarehousesService } from './services/warehouses.service';
import { AdjustmentsService } from './services/adjustments.service';
import { PriceListsService } from './services/price-lists.service';
import { CostingService } from './services/costing.service';
import { CompositeItemsService } from './services/composite-items.service';
import { TransfersService } from './services/transfers.service';
import { InventoryLevelsService } from './services/inventory-levels.service';
import { InventoryMovementsService } from './services/inventory-movements.service';
import { InventoryLevelsController } from './controllers/inventory-levels.controller';
import { InventoryMovementsController } from './controllers/inventory-movements.controller';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    ItemsController,
    WarehousesController,
    AdjustmentsController,
    PriceListsController,
    CompositeItemsController,
    TransfersController,
    InventoryLevelsController,
    InventoryMovementsController,
  ],
  providers: [
    ItemsService,
    WarehousesService,
    AdjustmentsService,
    PriceListsService,
    CostingService,
    CompositeItemsService,
    TransfersService,
    InventoryLevelsService,
    InventoryMovementsService,
  ],
  exports: [ItemsService, WarehousesService, CostingService],
})
export class InventoryModule {}
