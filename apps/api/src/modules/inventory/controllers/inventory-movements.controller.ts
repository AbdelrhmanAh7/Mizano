import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { InventoryMovementsService } from '../services/inventory-movements.service';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

@ApiTags('Inventory Movements')
@ApiBearerAuth()
@Controller('inventory-movements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryMovementsController {
  constructor(private readonly inventoryMovementsService: InventoryMovementsService) {}

  @Get()
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List inventory movements with pagination and filters' })
  findAll(
    @CurrentOrg() orgId: string,
    @Query()
    query: PaginationDto & {
      itemId?: string;
      warehouseId?: string;
      type?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    return this.inventoryMovementsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List inventory movements with cursor-based pagination' })
  findAllCursor(
    @CurrentOrg() orgId: string,
    @Query()
    query: CursorPaginationDto & {
      itemId?: string;
      warehouseId?: string;
      type?: string;
    },
  ) {
    return this.inventoryMovementsService.findAllCursor(orgId, query);
  }
}
