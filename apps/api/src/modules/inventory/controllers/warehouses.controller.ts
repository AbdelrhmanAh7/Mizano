import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WarehousesService } from '../services/warehouses.service';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Warehouses')
@ApiBearerAuth()
@Controller('warehouses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @Permissions('inventory.create')
  create(@CurrentOrg() orgId: string, @Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(orgId, dto);
  }

  @Get()
  @Permissions('inventory.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.warehousesService.findAll(orgId, query);
  }

  @Get(':id/stock')
  @Permissions('inventory.view')
  getStock(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.warehousesService.getStock(orgId, id);
  }

  @Get(':id')
  @Permissions('inventory.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.warehousesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('inventory.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('inventory.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.warehousesService.remove(orgId, id);
  }
}
