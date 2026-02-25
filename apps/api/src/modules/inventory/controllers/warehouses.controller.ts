import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WarehousesService } from '../services/warehouses.service';
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
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.warehousesService.create(orgId, dto);
  }

  @Get()
  @Permissions('inventory.view')
  findAll(@CurrentOrg() orgId: string) {
    return this.warehousesService.findAll(orgId);
  }

  @Get(':id')
  @Permissions('inventory.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.warehousesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Permissions('inventory.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) {
    return this.warehousesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Permissions('inventory.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.warehousesService.remove(orgId, id);
  }
}
