import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BillsService } from '../services/bills.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Bills')
@ApiBearerAuth()
@Controller('bills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Post() @Permissions('purchases.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.billsService.create(orgId, dto); }

  @Get() @Permissions('purchases.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) { return this.billsService.findAll(orgId, query); }

  @Get(':id') @Permissions('purchases.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.billsService.findOne(orgId, id); }

  @Patch(':id') @Permissions('purchases.edit')
  update(@CurrentOrg() orgId: string, @Param('id') id: string, @Body() dto: any) { return this.billsService.update(orgId, id, dto); }
}
