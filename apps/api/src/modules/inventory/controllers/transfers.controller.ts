import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TransfersService } from '../services/transfers.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Inventory Transfers')
@ApiBearerAuth()
@Controller('transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a stock transfer' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) {
    return this.transfersService.create(orgId, dto);
  }

  @Get()
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'List stock transfers' })
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto & { status?: string; fromWarehouseId?: string; toWarehouseId?: string }) {
    return this.transfersService.findAll(orgId, query);
  }

  @Get(':id')
  @Permissions('inventory.view')
  @ApiOperation({ summary: 'Get a stock transfer by ID' })
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.transfersService.findOne(orgId, id);
  }

  @Patch(':id/complete')
  @Permissions('inventory.edit')
  @ApiOperation({ summary: 'Complete a stock transfer' })
  complete(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.transfersService.complete(orgId, id);
  }

  @Patch(':id/cancel')
  @Permissions('inventory.edit')
  @ApiOperation({ summary: 'Cancel a stock transfer' })
  cancel(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.transfersService.cancel(orgId, id);
  }
}
