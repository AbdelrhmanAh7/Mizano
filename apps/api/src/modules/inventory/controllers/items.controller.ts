import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ItemsService } from '../services/items.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Items/Products')
@ApiBearerAuth()
@Controller('items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post() @Permissions('inventory.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.itemsService.create(orgId, dto); }

  @Get() @Permissions('inventory.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) { return this.itemsService.findAll(orgId, query); }

  @Get(':id') @Permissions('inventory.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.itemsService.findOne(orgId, id); }

  @Patch(':id') @Permissions('inventory.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) { return this.itemsService.update(orgId, id, dto); }

  @Delete(':id') @Permissions('inventory.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.itemsService.remove(orgId, id); }
}
