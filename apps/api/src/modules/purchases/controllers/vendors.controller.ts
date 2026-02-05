import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VendorsService } from '../services/vendors.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post() @Permissions('purchases.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.vendorsService.create(orgId, dto); }

  @Get() @Permissions('purchases.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) { return this.vendorsService.findAll(orgId, query); }

  @Get(':id') @Permissions('purchases.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.vendorsService.findOne(orgId, id); }

  @Patch(':id') @Permissions('purchases.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) { return this.vendorsService.update(orgId, id, dto); }

  @Delete(':id') @Permissions('purchases.delete')
  remove(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.vendorsService.remove(orgId, id); }
}
