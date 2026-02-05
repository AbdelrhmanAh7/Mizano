import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PriceListsService } from '../services/price-lists.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@ApiTags('Price Lists')
@ApiBearerAuth()
@Controller('price-lists')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PriceListsController {
  constructor(private readonly priceListsService: PriceListsService) {}

  @Post() @Permissions('inventory.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.priceListsService.create(orgId, dto); }

  @Get() @Permissions('inventory.view')
  findAll(@CurrentOrg() orgId: string) { return this.priceListsService.findAll(orgId); }

  @Get(':id') @Permissions('inventory.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.priceListsService.findOne(orgId, id); }

  @Patch(':id') @Permissions('inventory.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) { return this.priceListsService.update(orgId, id, dto); }

  @Delete(':id') @Permissions('inventory.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.priceListsService.remove(orgId, id); }
}
