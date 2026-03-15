import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { InventoryLevelsService } from '../services/inventory-levels.service';

@ApiTags('Inventory Levels')
@ApiBearerAuth()
@Controller('inventory-levels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryLevelsController {
  constructor(private readonly inventoryLevelsService: InventoryLevelsService) {}

  @Get()
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List inventory levels with optional filters' })
  findAll(
    @CurrentOrg() orgId: string,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryLevelsService.findAll(orgId, { itemId, warehouseId });
  }

  @Get('by-item/:itemId')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get inventory levels for a specific item across all warehouses' })
  findByItem(@CurrentOrg() orgId: string, @Param('itemId') itemId: string) {
    return this.inventoryLevelsService.findByItem(orgId, itemId);
  }
}
