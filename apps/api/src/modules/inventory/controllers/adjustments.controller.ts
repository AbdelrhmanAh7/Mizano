import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AdjustmentsService } from '../services/adjustments.service';

@ApiTags('Inventory Adjustments')
@ApiBearerAuth()
@Controller('inventory-adjustments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdjustmentsController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {}

  @Post()
  @Permissions('inventory.create')
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.adjustmentsService.create(orgId, dto);
  }

  @Get()
  @Permissions('inventory.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto) {
    return this.adjustmentsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List adjustments with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: CursorPaginationDto) {
    return this.adjustmentsService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('inventory.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.adjustmentsService.findOne(orgId, id);
  }
}
