import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdjustmentsService } from '../services/adjustments.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Inventory Adjustments')
@ApiBearerAuth()
@Controller('inventory-adjustments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdjustmentsController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {}

  @Post() @Permissions('inventory.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.adjustmentsService.create(orgId, dto); }

  @Get() @Permissions('inventory.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) { return this.adjustmentsService.findAll(orgId, query); }

  @Get(':id') @Permissions('inventory.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.adjustmentsService.findOne(orgId, id); }
}
